import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { initWorkspace, runCheck, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { Writable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { createContinuumServer } from '../server'

const NOW = new Date('2026-10-16T12:00:00.000Z')
const sandboxes: Sandbox[] = []
const clients: Client[] = []
const dirs: string[] = []

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close()
  for (const repo of sandboxes.splice(0)) repo.cleanup()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const silent = () => new Writable({ write: (_chunk, _encoding, done) => done() })

async function connect(cwd: string) {
  const server = createContinuumServer({ cwd, version: '0.0.0-test', now: () => NOW })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  clients.push(client)
  return client
}

async function initializedRepo(files: Record<string, string> = { 'src/auth.ts': 'auth', 'src/db.ts': 'db', '.gitignore': 'dist/\n' }) {
  const repo = createSandbox(files)
  sandboxes.push(repo)
  const { store } = await initWorkspace(repo.root)
  await scanRepository(store, repo.root)
  await runCheck(store, { root: repo.root, command: process.execPath, args: ['-e', '0'], name: 'unit', stdout: silent(), stderr: silent() })
  store.close()
  return repo
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [first] = result.content as { type: string; text: string }[]
  return first?.text ?? ''
}

describe('Continuum MCP server', () => {
  it('lists its tools with read-only hints on the read tools', async () => {
    const client = await connect((await initializedRepo()).root)
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(['get_handoff', 'get_project_state', 'record_decision', 'start_task', 'update_task'])
    expect(tools.find((tool) => tool.name === 'get_handoff')?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find((tool) => tool.name === 'record_decision')?.annotations?.readOnlyHint).toBe(false)
  })

  it('returns a handoff judged against the current code', async () => {
    const repo = await initializedRepo()
    const client = await connect(repo.root)
    expect(text(await client.callTool({ name: 'get_handoff', arguments: {} }))).toContain('- [verified] passed: `unit`')
    repo.write('src/auth.ts', 'changed')
    const handoff = text(await client.callTool({ name: 'get_handoff', arguments: {} }))
    expect(handoff).toContain('OUT OF DATE: `unit`')
    expect(handoff).toContain('changed since: `src/auth.ts`')
    expect(handoff).toContain('- modified `src/auth.ts`')
  })

  it('honours and validates the handoff size limit', async () => {
    const client = await connect((await initializedRepo()).root)
    const short = text(await client.callTool({ name: 'get_handoff', arguments: { max_chars: 1000 } }))
    expect(short.length).toBeLessThanOrEqual(1000)
    const invalid = await client.callTool({ name: 'get_handoff', arguments: { max_chars: 5 } })
    expect(invalid.isError).toBe(true)
  })

  it('returns structured state as JSON', async () => {
    const client = await connect((await initializedRepo()).root)
    const state = JSON.parse(text(await client.callTool({ name: 'get_project_state', arguments: {} })))
    expect(state).toMatchObject({ files: { tracked: 3, unrecorded: [], unrecordedTotal: 0 }, checks: [{ name: 'unit', status: 'passed' }] })
  })

  it('records decisions anchored to files and flags them when those files change', async () => {
    const repo = await initializedRepo()
    const client = await connect(join(repo.root, 'src'))
    const recorded = await client.callTool({
      name: 'record_decision',
      arguments: { title: 'Sessions live in db.ts', body: 'Do not cache sessions in auth.ts.', files: ['db.ts'] },
    })
    expect(recorded.isError).toBeFalsy()
    expect(text(recorded)).toMatch(/^Recorded decision [0-9a-f-]{36}, anchored to 1 file\./)
    expect(text(await client.callTool({ name: 'get_handoff', arguments: {} }))).toContain('[agent-reported] Decision: Sessions live in db.ts. Do not cache sessions in auth.ts.')
    repo.write('src/db.ts', 'rewritten')
    expect(text(await client.callTool({ name: 'get_handoff', arguments: {} }))).toContain('(anchored code changed since: `src/db.ts`)')
  })

  it('redacts secrets in recorded notes', async () => {
    const repo = await initializedRepo()
    const client = await connect(repo.root)
    const value = ['not', 'real', 'value'].join('-')
    await client.callTool({ name: 'record_decision', arguments: { title: 'Staging creds', body: `Use API_KEY=${value} for staging`, kind: 'known-issue' } })
    const handoff = text(await client.callTool({ name: 'get_handoff', arguments: {} }))
    expect(handoff).toContain('Known issue: Staging creds. Use API_KEY=[redacted] for staging')
    expect(handoff).not.toContain(value)
  })

  it('rejects anchors outside the repository, ignored by git, or missing', async () => {
    const repo = await initializedRepo()
    repo.write('dist/out.js', 'built')
    const client = await connect(repo.root)
    const attempt = (files: string[]) => client.callTool({ name: 'record_decision', arguments: { title: 't', files } })
    expect(text(await attempt(['../outside.ts']))).toContain('Files must be inside the repository: ../outside.ts')
    expect(text(await attempt(['dist/out.js']))).toContain('Files ignored by git cannot anchor a decision: dist/out.js')
    expect(text(await attempt(['src/nope.ts']))).toContain('Files not found (symlinks are not followed): src/nope.ts')
    symlinkSync('/etc/hosts', join(repo.root, 'hosts-link'))
    expect(text(await attempt(['hosts-link']))).toContain('Files not found (symlinks are not followed): hosts-link')
    expect((await attempt(['src/nope.ts'])).isError).toBe(true)
  })

  it('explains how to set up Continuum when the repository has none', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    const client = await connect(repo.root)
    const result = await client.callTool({ name: 'get_handoff', arguments: {} })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('Run `continuum init` first')
    const plain = mkdtempSync(join(tmpdir(), 'continuum-plain-'))
    dirs.push(plain)
    expect(text(await (await connect(plain)).callTool({ name: 'get_project_state', arguments: {} }))).toContain('Not inside a git repository')
  })
})
