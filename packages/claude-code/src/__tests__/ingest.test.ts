import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initWorkspace, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { ContextStore } from '@continuum/store'
import { afterEach, describe, expect, it } from 'vitest'
import { InvalidHookPayloadError } from '../hookPayload'
import { ingestHook } from '../ingest'

const NOW = new Date('2026-10-16T12:00:00.000Z')
const sandboxes: Sandbox[] = []
const dirs: string[] = []

afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function initialized(files: Record<string, string> = { 'src/a.ts': 'a', '.gitignore': 'dist/\n' }) {
  const repo = createSandbox(files)
  sandboxes.push(repo)
  const { store, workspace } = await initWorkspace(repo.root)
  await scanRepository(store, repo.root)
  store.close()
  return { repo, storePath: workspace.storePath }
}

function hook(repo: Sandbox, fields: Record<string, unknown>, sessionId = 'sess-1') {
  return JSON.stringify({ session_id: sessionId, cwd: repo.root, transcript_path: '/t.jsonl', ...fields })
}

function withStore<T>(path: string, read: (store: ContextStore) => T): T {
  const store = ContextStore.open(path)
  try {
    return read(store)
  } finally {
    store.close()
  }
}

describe('ingestHook', () => {
  it('ignores repositories without Continuum and non-git directories', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    expect(await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }))).toEqual({
      status: 'ignored',
      reason: 'Continuum is not set up in this repository',
    })
    const plain = mkdtempSync(join(tmpdir(), 'continuum-plain-'))
    dirs.push(plain)
    expect((await ingestHook(JSON.stringify({ session_id: 's', cwd: plain, hook_event_name: 'Stop' }))).status).toBe('ignored')
  })

  it('ignores unhandled hook events and rejects malformed payloads', async () => {
    const { repo } = await initialized()
    expect((await ingestHook(hook(repo, { hook_event_name: 'PreCompact' }))).status).toBe('ignored')
    await expect(ingestHook('{oops')).rejects.toBeInstanceOf(InvalidHookPayloadError)
  })

  it('records a session, the files Claude edited and its last message', async () => {
    const { repo, storePath } = await initialized()
    await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }), { now: () => NOW })
    repo.write('src/a.ts', 'edited by claude')
    const edit = await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'src/a.ts') } }))
    expect(edit).toEqual({ status: 'recorded', events: 1 })
    await ingestHook(hook(repo, { hook_event_name: 'Stop', last_assistant_message: 'Refactored a.ts; tests next.' }))

    withStore(storePath, (store) => {
      expect(store.graph.neighbors('session:sess-1', { direction: 'out', types: ['modified'] })).toEqual(['file:src/a.ts'])
      expect(store.graph.get('file:src/a.ts')?.hash).toBe(repo.git('hash-object', 'src/a.ts'))
      expect(store.graph.get('session:sess-1')?.props).toMatchObject({ agent: 'claude-code', lastNote: 'Refactored a.ts; tests next.' })
    })
  })

  it('accepts edit paths relative to the hook cwd', async () => {
    const { repo, storePath } = await initialized()
    repo.write('src/b.ts', 'new')
    const payload = JSON.stringify({ session_id: 's', cwd: join(repo.root, 'src'), hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'b.ts' }, tool_response: { type: 'create' } })
    expect(await ingestHook(payload)).toEqual({ status: 'recorded', events: 1 })
    withStore(storePath, (store) => expect(store.graph.get('file:src/b.ts')?.props.changeType).toBe('added'))
  })

  it('skips edits outside the repository or ignored by git', async () => {
    const { repo } = await initialized()
    repo.write('dist/out.js', 'built')
    const ignored = await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(repo.root, 'dist/out.js') } }))
    expect(ignored).toEqual({ status: 'ignored', reason: 'edited file is outside what Continuum captures' })
    const outside = await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: '/etc/hosts' } }))
    expect(outside.status).toBe('ignored')
    symlinkSync('/etc/hosts', join(repo.root, 'hosts-link'))
    const viaLink = await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'hosts-link') } }))
    expect(viaLink.status).toBe('ignored')
  })

  it('briefs a new session on where the previous one left off', async () => {
    const { repo } = await initialized()
    await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }, 'first'), { now: () => NOW })
    await ingestHook(hook(repo, { hook_event_name: 'Stop', last_assistant_message: 'Login form done; wire the API next.' }, 'first'), { now: () => NOW })
    await ingestHook(hook(repo, { hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' }, 'first'), { now: () => NOW })

    const next = await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }, 'second'), { now: () => NOW })
    expect(next.status).toBe('recorded')
    const context = next.status === 'recorded' ? (next.additionalContext ?? '') : ''
    expect(context).toContain('Continuum (local project memory)')
    expect(context).toContain('"Login form done; wire the API next."')
    expect(context).toContain('ended')
    expect(context.length).toBeLessThan(10_000)
  })

  it('adds no context when there is nothing from before', async () => {
    const { repo } = await initialized()
    const first = await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }))
    expect(first).toEqual({ status: 'recorded', events: 1 })
  })
})
