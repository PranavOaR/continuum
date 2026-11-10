import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { openWorkspace } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { createContinuumServer } from '@continuum/mcp'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE } from '../io'
import { cli, NOW } from './harness'

const sandboxes: Sandbox[] = []
const clients: Client[] = []
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close()
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

const AUTH = ['export function login(user: string) {', "  return user.trim() !== ''", '}', '', 'export function logout() {', '  return true', '}', ''].join('\n')

/** A committed repository with one decision anchored to `login` and one to the whole README, recorded as an agent would. */
async function repoWithDecisions() {
  const repo = createSandbox({ 'src/auth.ts': AUTH, 'README.md': 'readme\n', 'notes.md': 'notes\n' })
  sandboxes.push(repo)
  repo.commit('initial')
  await cli(repo.root, ['init'])
  const server = createContinuumServer({ cwd: repo.root, version: 'test', now: () => NOW })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  clients.push(client)
  await client.callTool({ name: 'record_decision', arguments: { title: 'Login trims the user name', body: 'Empty names are refused.', files: ['src/auth.ts#login'] } })
  await client.callTool({ name: 'record_decision', arguments: { title: 'README stays one page', files: ['README.md'] } })
  return repo
}

describe('continuum check', () => {
  it('says so when nothing is staged, or nothing staged is anchored', async () => {
    const repo = await repoWithDecisions()
    expect(await cli(repo.root, ['check'])).toMatchObject({ code: EXIT_OK, out: 'Nothing is staged, so there is nothing to check.' })
    repo.write('notes.md', 'more notes\n')
    repo.git('add', 'notes.md')
    expect(await cli(repo.root, ['check', '--strict'])).toMatchObject({ code: EXIT_OK, out: 'No recorded decision is anchored to the code in the staged file.' })
  })

  it('names the decision and the symbol when the staged diff changes the anchored symbol', async () => {
    const repo = await repoWithDecisions()
    repo.write('src/auth.ts', AUTH.replace("user.trim() !== ''", 'true'))
    repo.git('add', 'src/auth.ts')
    const result = await cli(repo.root, ['check'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain('1 recorded decision is anchored to code this commit changes:')
    expect(result.out).toContain('- [agent-reported] decision: Login trims the user name (Empty names are refused.)')
    expect(result.out).toContain('  changes: src/auth.ts#login')
    expect(result.out).not.toContain('README stays one page')
  })

  it('ignores a staged edit elsewhere in the file of a symbol anchor, and unstaged edits', async () => {
    const repo = await repoWithDecisions()
    repo.write('src/auth.ts', AUTH.replace('return true', 'return false'))
    repo.git('add', 'src/auth.ts')
    repo.write('README.md', 'not staged\n')
    expect((await cli(repo.root, ['check'])).out).toBe('No recorded decision is anchored to the code in the staged file.')
  })

  it('counts a staged deletion of an anchored file, and --strict then exits 1', async () => {
    const repo = await repoWithDecisions()
    repo.git('rm', '--quiet', 'README.md')
    const result = await cli(repo.root, ['check', '--strict'])
    expect(result.code).toBe(EXIT_FAILURE)
    expect(result.out).toContain('decision: README stays one page')
    expect(result.out).toContain('  changes: README.md')
    expect((await cli(repo.root, ['check'])).code).toBe(EXIT_OK)
  })

  it('treats the same symbol with Windows line endings as unchanged', async () => {
    const repo = await repoWithDecisions()
    const { store } = await openWorkspace(repo.root)
    // As a checkout with core.autocrlf anchored it: the symbol's hash over CRLF text.
    const crlf = (await import('@continuum/capture')).extractSymbols('src/auth.ts', AUTH.replaceAll('\n', '\r\n'))?.find((symbol) => symbol.name === 'login')?.hash as string
    store.record({ type: 'memory.recorded', payload: { id: 'crlf', kind: 'decision', title: 'Anchored on Windows', body: '', anchors: { 'symbol:src/auth.ts#login': crlf } }, evidence: 'agent-reported', source: 'mcp', occurredAt: NOW.toISOString() })
    store.close()
    repo.write('src/auth.ts', AUTH.replace('return true', 'return false'))
    repo.git('add', 'src/auth.ts')
    expect((await cli(repo.root, ['check'])).out).not.toContain('Anchored on Windows')
  })

  it('leaves out decisions you resolved and paths .continuumignore lists', async () => {
    const repo = await repoWithDecisions()
    repo.write('.continuumignore', 'README.md\n')
    repo.write('README.md', 'changed\n')
    repo.git('add', 'README.md')
    expect((await cli(repo.root, ['check'])).out).not.toContain('README stays one page')
  })

  it('refuses unknown arguments', async () => {
    expect((await cli((await repoWithDecisions()).root, ['check', '--bogus'])).code).toBe(EXIT_USAGE)
  })
})
