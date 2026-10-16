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

  it('links edits to the current task and briefs the next session on it', async () => {
    const { repo, storePath } = await initialized()
    withStore(storePath, (store) =>
      store.record({ type: 'task.upserted', payload: { id: 'oauth', title: 'Add Google sign-in', status: 'in-progress', nextAction: 'Validate state' }, evidence: 'agent-reported', source: 'mcp', occurredAt: NOW.toISOString() }),
    )
    await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }, 'one'), { now: () => NOW })
    repo.write('src/a.ts', 'oauth work')
    await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'src/a.ts') } }, 'one'), { now: () => NOW })
    withStore(storePath, (store) => {
      expect(store.graph.neighbors('task:oauth', { direction: 'out', types: ['touches'] })).toEqual(['file:src/a.ts'])
      expect(store.graph.neighbors('session:one', { direction: 'out', types: ['worked_on'] })).toEqual(['task:oauth'])
    })
    const next = await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }, 'two'), { now: () => NOW })
    const context = next.status === 'recorded' ? (next.additionalContext ?? '') : ''
    expect(context).toContain('## Current task')
    expect(context).toContain('Next action: "Validate state"')
    expect(context).toContain('start_task when you begin')
  })

  it('adds no context when there is nothing from before', async () => {
    const { repo } = await initialized()
    const first = await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }))
    expect(first).toEqual({ status: 'recorded', events: 1 })
  })
})

describe('ingestHook for checks the agent runs', () => {
  const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command, description: 'run tests' } })

  it('records a passing test run as observed, against the files as they are now', async () => {
    const { repo, storePath } = await initialized()
    repo.write('src/a.ts', 'a2')
    const outcome = await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', ...bash('npm test'), tool_response: { stdout: '3 passed', stderr: '', interrupted: false }, duration_ms: 1500 }), { now: () => NOW })
    expect(outcome).toEqual({ status: 'recorded', events: 1 })
    withStore(storePath, (store) => {
      expect(store.checkStatus('npm test').status).toBe('passed')
      expect(store.graph.get('check:npm test')?.props).toMatchObject({ evidence: 'observed', source: 'adapter:claude-code', exitCode: 0 })
      expect(store.checkRun('npm test')?.ranAgainst).toHaveProperty('file:src/a.ts')
    })
  })

  it('records a failing run with the exit code Claude Code reported', async () => {
    const { repo, storePath } = await initialized()
    await ingestHook(hook(repo, { hook_event_name: 'PostToolUseFailure', ...bash('npx vitest run'), error: 'Exit code 1\nFAIL src/a.test.ts' }), { now: () => NOW })
    withStore(storePath, (store) => {
      expect(store.checkStatus('npx vitest run').status).toBe('failed')
      expect(store.graph.get('check:npx vitest run')?.props.exitCode).toBe(1)
    })
  })

  it('ignores other commands, interrupted runs and failures without an exit code', async () => {
    const { repo, storePath } = await initialized()
    const events = withStore(storePath, (store) => store.eventCount())
    const ignored = [
      { hook_event_name: 'PostToolUse', ...bash('ls -la'), tool_response: { stdout: '' } },
      { hook_event_name: 'PostToolUse', ...bash('npm test'), tool_response: { interrupted: true } },
      { hook_event_name: 'PostToolUseFailure', ...bash('npm test'), error: 'Command timed out' },
      { hook_event_name: 'PostToolUseFailure', ...bash('npm test'), error: 'Exit code 130', is_interrupt: true },
      { hook_event_name: 'PostToolUseFailure', tool_name: 'Write', tool_input: { file_path: join(repo.root, 'src/a.ts') }, error: 'denied' },
    ]
    for (const fields of ignored) expect((await ingestHook(hook(repo, fields), { now: () => NOW })).status).toBe('ignored')
    expect(withStore(storePath, (store) => store.eventCount())).toBe(events)
  })

  it('respects agent checks being turned off', async () => {
    const { repo } = await initialized()
    const { updateConfig } = await import('@continuum/capture')
    await updateConfig(repo.root, { agentChecks: false })
    const outcome = await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', ...bash('npm test'), tool_response: { stdout: 'ok' } }), { now: () => NOW })
    expect(outcome).toEqual({ status: 'ignored', reason: 'agent checks are turned off for this repository' })
  })

  it('labels agent runs differently from verified runs in the next briefing', async () => {
    const { repo } = await initialized()
    await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', ...bash('npm test'), tool_response: { stdout: 'ok' } }), { now: () => NOW })
    const next = await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }, 'sess-2'), { now: () => NOW })
    expect(next.status === 'recorded' && next.additionalContext).toContain('[observed: run by an agent] passed: `npm test`. Ran')
  })
})

describe('ingestHook per-session tasks', () => {
  const startTask = (title: string, id: string) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__continuum__start_task',
    tool_input: { title },
    tool_response: [{ type: 'text', text: `Task ${id}: "${title}" is in-progress.\nNext: write it` }],
  })

  it("attributes each session's edits to the task it took up, not the latest one", async () => {
    const { repo, storePath } = await initialized()
    withStore(storePath, (store) => {
      store.record({ type: 'task.upserted', payload: { id: 'auth-1', title: 'Auth', status: 'in-progress' }, evidence: 'agent-reported', source: 'mcp', occurredAt: NOW.toISOString() })
      store.record({ type: 'task.upserted', payload: { id: 'docs-2', title: 'Docs', status: 'in-progress' }, evidence: 'agent-reported', source: 'mcp', occurredAt: new Date(NOW.getTime() + 1000).toISOString() })
    })
    const later = () => new Date(NOW.getTime() + 2000)
    await ingestHook(hook(repo, startTask('Auth', 'auth-1'), 'agent-a'), { now: later })
    await ingestHook(hook(repo, startTask('Docs', 'docs-2'), 'agent-b'), { now: later })

    repo.write('src/a.ts', 'by agent a')
    await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'src/a.ts') } }, 'agent-a'), { now: later })
    withStore(storePath, (store) => {
      expect(store.graph.neighbors('task:auth-1', { direction: 'out', types: ['touches'] })).toContain('file:src/a.ts')
      expect(store.graph.neighbors('task:docs-2', { direction: 'out', types: ['touches'] })).not.toContain('file:src/a.ts')
      expect(store.graph.get('session:agent-a')?.props.taskId).toBe('auth-1')
    })
  })
})

describe('ingestHook prompts', () => {
  const prompt = (text: string) => ({ hook_event_name: 'UserPromptSubmit', prompt: text })

  it('records nothing unless prompt capture is turned on', async () => {
    const { repo } = await initialized()
    expect((await ingestHook(hook(repo, prompt('fix the login bug')), { now: () => NOW })).status).toBe('ignored')
  })

  it('keeps prompts redacted, without pasted content, once turned on', async () => {
    const { repo, storePath } = await initialized()
    const { updateConfig } = await import('@continuum/capture')
    await updateConfig(repo.root, { capturePrompts: true })
    const pasted = '<pasted_content id="p1">\nAPI_KEY=abc123secretvalue\n</pasted_content id="p1">'
    await ingestHook(hook(repo, prompt(`Fix login, here is the log:\n${pasted}\nToken: Bearer ${'x'.repeat(30)}`)), { now: () => NOW })
    const kept = withStore(storePath, (store) => store.graph.get('session:sess-1')?.props.lastPrompt) as string
    expect(kept).toContain('Fix login')
    expect(kept).toContain('[pasted content]')
    expect(kept).not.toContain('abc123secretvalue')
    expect(kept).not.toContain('x'.repeat(30))
    const next = await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }, 'sess-2'), { now: () => NOW })
    expect(next.status === 'recorded' && next.additionalContext).toContain('Last request [said by you]: "Fix login')
  })
})

describe('changes outside agent sessions', () => {
  it('tells the next session which edits no agent made', async () => {
    const { repo, storePath } = await initialized({ 'src/a.ts': 'a', 'about.html': '<p>hi</p>' })
    // After the helper's first scan, which uses the real clock.
    const start = Date.now()
    const later = (ms: number) => () => new Date(start + ms)
    await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }), { now: later(1000) })
    repo.write('src/a.ts', 'by the agent')
    await ingestHook(hook(repo, { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'src/a.ts') } }), { now: later(2000) })
    repo.write('about.html', '<p>edited by hand</p>')
    const { scanRepository: scan } = await import('@continuum/capture')
    const store = ContextStore.open(storePath)
    await scan(store, repo.root, { now: later(3000) })
    store.close()

    const next = await ingestHook(hook(repo, { hook_event_name: 'SessionStart', source: 'startup' }, 'sess-2'), { now: later(4000) })
    const context = next.status === 'recorded' ? (next.additionalContext ?? '') : ''
    const section = context.slice(context.indexOf('## Changed outside agent sessions'))
    expect(section).toContain('- modified `about.html`')
    expect(section).not.toContain('src/a.ts')
  })
})
