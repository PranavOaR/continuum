import { join } from 'node:path'
import { initWorkspace, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { ContextStore } from '@continuum/store'
import { afterEach, describe, expect, it } from 'vitest'
import { editedFiles, parseHookPayload, withVsCodeDefaults } from '../hookPayload'
import { ingestHook } from '../ingest'

const NOW = new Date('2026-10-20T12:00:00.000Z')
const sandboxes: Sandbox[] = []

afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

async function initialized(files: Record<string, string> = { 'src/a.ts': 'a' }) {
  const repo = createSandbox(files)
  sandboxes.push(repo)
  const { store, workspace } = await initWorkspace(repo.root)
  await scanRepository(store, repo.root)
  store.close()
  return { repo, storePath: workspace.storePath }
}

function withStore<T>(path: string, read: (store: ContextStore) => T): T {
  const store = ContextStore.open(path)
  try {
    return read(store)
  } finally {
    store.close()
  }
}

/** VS Code's documented hook input: snake_case common fields, a timestamp, and the event's own. */
function vscodeHook(repo: Sandbox, fields: Record<string, unknown>, sessionId = 'vs-1') {
  return JSON.stringify({ timestamp: NOW.toISOString(), session_id: sessionId, cwd: repo.root, transcript_path: '/t/chat.json', ...fields })
}

const asVsCode = { now: () => NOW, agent: 'vscode' as const }
const toolUse = (tool_name: string, tool_input: Record<string, unknown>) => ({ hook_event_name: 'PostToolUse', tool_name, tool_input, tool_use_id: 'call-1', tool_response: 'ok' })

describe('VS Code payloads', () => {
  const prepare = withVsCodeDefaults('/repo', (transcript) => `from:${transcript}`)

  it('fills in the working directory and derives a session id from the transcript when VS Code sends neither', () => {
    const payload = parseHookPayload(JSON.stringify({ hook_event_name: 'Stop', transcript_path: '/t/chat.json', stop_hook_active: false }), prepare)
    expect(payload).toMatchObject({ session_id: 'from:/t/chat.json', cwd: '/repo' })
  })

  it('reads camelCase fields, preferring the snake_case spelling when both are present', () => {
    const payload = parseHookPayload(JSON.stringify({ hookEventName: 'PostToolUse', sessionId: 'camel', session_id: 'snake', cwd: '/x', toolName: 'create_file', toolInput: { filePath: '/x/a.ts' } }), prepare)
    expect(payload).toMatchObject({ session_id: 'snake', tool_name: 'create_file', tool_input: { filePath: '/x/a.ts' } })
  })

  it('names every file each of Copilot’s edit tools wrote', () => {
    const edits = (tool: string, input: Record<string, unknown>) => editedFiles(parseHookPayload(JSON.stringify({ session_id: 's', cwd: '/x', ...toolUse(tool, input) }))!)
    expect(edits('create_file', { filePath: '/x/a.ts', content: 'a' })).toEqual([{ path: '/x/a.ts' }])
    expect(edits('copilot_replaceString', { filePath: '/x/b.ts', oldString: 'a', newString: 'b' })).toEqual([{ path: '/x/b.ts' }])
    expect(edits('multi_replace_string_in_file', { replacements: [{ filePath: '/x/a.ts' }, { filePath: '/x/b.ts' }, { filePath: '/x/a.ts' }] })).toEqual([{ path: '/x/a.ts' }, { path: '/x/b.ts' }])
    expect(edits('apply_patch', { input: '*** Begin Patch\n*** Add File: /x/c.ts\n+c\n*** End Patch', explanation: 'add c' })).toEqual([{ path: '/x/c.ts', changeType: 'added' }])
    expect(edits('read_file', { filePath: '/x/a.ts' })).toEqual([])
  })
})

describe('ingestHook for VS Code', () => {
  it('records a Copilot session, its edits, and briefs the next one', async () => {
    const { repo, storePath } = await initialized({ 'src/a.ts': 'a', 'src/b.ts': 'b' })
    expect((await ingestHook(vscodeHook(repo, { hook_event_name: 'SessionStart', source: 'new' }), asVsCode)).status).toBe('recorded')
    repo.write('src/a.ts', 'a2')
    repo.write('src/b.ts', 'b2')
    repo.write('src/c.ts', 'c')
    const replaced = toolUse('multi_replace_string_in_file', { replacements: [{ filePath: join(repo.root, 'src/a.ts') }, { filePath: join(repo.root, 'src/b.ts') }] })
    expect(await ingestHook(vscodeHook(repo, replaced), asVsCode)).toEqual({ status: 'recorded', events: 2 })
    expect(await ingestHook(vscodeHook(repo, toolUse('create_file', { filePath: join(repo.root, 'src/c.ts'), content: 'c' })), asVsCode)).toEqual({ status: 'recorded', events: 1 })

    withStore(storePath, (store) => {
      expect(store.graph.get('session:vs-1')?.props.agent).toBe('vscode')
      expect(store.graph.get('file:src/c.ts')?.props.changedBy).toBe('vs-1')
      const sources = store.recentEvents(3).map(({ event }) => event.source)
      expect(new Set(sources)).toEqual(new Set(['adapter:vscode']))
    })

    const next = await ingestHook(vscodeHook(repo, { hook_event_name: 'SessionStart', source: 'new' }, 'vs-2'), asVsCode)
    const context = next.status === 'recorded' ? (next.additionalContext ?? '') : ''
    expect(context).toContain('Continuum (local project memory)')
    expect(context).toContain('`vscode` session')
    expect(context).toContain('`src/c.ts`')
  })

  it('records nothing for tools that do not write files, and no checks, because VS Code reports no exit code', async () => {
    const { repo, storePath } = await initialized()
    const before = withStore(storePath, (store) => store.eventCount())
    expect(await ingestHook(vscodeHook(repo, toolUse('read_file', { filePath: join(repo.root, 'src/a.ts') })), asVsCode)).toEqual({ status: 'recorded', events: 0 })
    expect(await ingestHook(vscodeHook(repo, toolUse('run_in_terminal', { command: 'npm test', isBackground: false })), asVsCode)).toEqual({ status: 'recorded', events: 0 })
    expect(withStore(storePath, (store) => store.eventCount())).toBe(before)
  })

  it('uses the directory the hook runs in when the payload has no cwd', async () => {
    const { repo, storePath } = await initialized()
    repo.write('src/a.ts', 'a2')
    const payload = JSON.stringify({ session_id: 'vs-cwd', ...toolUse('create_file', { filePath: join(repo.root, 'src/a.ts') }) })
    expect(await ingestHook(payload, { ...asVsCode, cwd: repo.root })).toEqual({ status: 'recorded', events: 1 })
    withStore(storePath, (store) => expect(store.graph.get('file:src/a.ts')?.props.changedBy).toBe('vs-cwd'))
  })

  it('gives one chat one session when VS Code sends only a transcript path, and skips a payload with neither', async () => {
    const { repo, storePath } = await initialized()
    const noId = (fields: Record<string, unknown>) => JSON.stringify({ cwd: repo.root, ...fields })
    await ingestHook(noId({ hook_event_name: 'SessionStart', transcript_path: '/t/one.json' }), asVsCode)
    await ingestHook(noId({ hook_event_name: 'SessionStart', transcript_path: '/t/one.json' }), asVsCode)
    withStore(storePath, (store) => expect(store.graph.keysOfKind('session')).toHaveLength(1))
    expect(await ingestHook(noId({ hook_event_name: 'SessionStart' }), asVsCode)).toEqual({ status: 'ignored', reason: 'VS Code sent no session id or transcript path' })
  })

  it('links the session to the task Copilot started through the MCP tools', async () => {
    const { repo, storePath } = await initialized()
    const started = { ...toolUse('mcp_continuum_start_task', { title: 'Fix login' }), tool_response: [{ kind: 'text', value: 'Task fix-login: "Fix login" (in-progress)' }] }
    expect(await ingestHook(vscodeHook(repo, started), asVsCode)).toEqual({ status: 'recorded', events: 1 })
    withStore(storePath, (store) => expect(store.graph.get('session:vs-1')?.props.taskId).toBe('fix-login'))
  })
})
