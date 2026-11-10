import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initWorkspace, openWorkspace, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { antigravityOutput, fromAntigravity } from '../antigravity'
import { ingestHook } from '../ingest'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

async function repo() {
  const created = createSandbox({ 'src/app.ts': 'export const app = 1\n' })
  sandboxes.push(created)
  const { store } = await initWorkspace(created.root)
  await scanRepository(store, created.root)
  store.close()
  return created
}

/** What Antigravity CLI sends on stdin: camelCase, with no event name. */
const payload = (root: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ conversationId: 'conv-1', workspacePaths: [root], transcriptPath: join(root, 't.jsonl'), artifactDirectoryPath: '/tmp/a', modelName: 'gemini', lastUserInput: 'add a test', ...extra })

describe('fromAntigravity', () => {
  it('turns an edit into the hook payload Continuum records, with the file the tool named', () => {
    const data = fromAntigravity('PostToolUse', '/fallback')({ conversationId: 'c', workspacePaths: ['/repo'], toolCall: { name: 'replace_file_content', args: { TargetFile: '/repo/src/a.ts' } } })
    expect(data).toMatchObject({ hook_event_name: 'PostToolUse', session_id: 'c', cwd: '/repo', tool_name: 'Edit', tool_input: { file_path: '/repo/src/a.ts' } })
    expect(fromAntigravity('PostToolUse', '/fallback')({ conversationId: 'c', toolCall: { name: 'write_to_file', args: { TargetFile: 'b.ts' } } })).toMatchObject({ tool_name: 'Write', cwd: '/fallback' })
  })

  it('leaves out an edit that failed, a tool it does not record and an event it does not use', () => {
    expect(fromAntigravity('PostToolUse', '/r')({ conversationId: 'c', toolCall: { name: 'write_to_file', args: { TargetFile: 'b.ts' } }, error: 'permission denied' }).hook_event_name).toBe('Ignored')
    expect(fromAntigravity('PostToolUse', '/r')({ conversationId: 'c', toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } } }).hook_event_name).toBe('Ignored')
    expect(fromAntigravity('PreInvocation', '/r')({ conversationId: 'c' }).hook_event_name).toBe('Ignored')
  })
})

describe('antigravityOutput', () => {
  it('injects the briefing at session start as a system step, lets Stop end the turn, and returns an empty object otherwise', () => {
    expect(antigravityOutput('SessionStart', 'briefing')).toEqual({ injectSteps: [{ systemMessage: { systemMessage: 'briefing' } }] })
    expect(antigravityOutput('SessionStart', undefined)).toEqual({})
    expect(antigravityOutput('Stop', undefined)).toEqual({ decision: 'stop' })
    expect(antigravityOutput('PostToolUse', undefined)).toEqual({})
  })
})

describe('ingesting Antigravity CLI hooks', () => {
  it('records the session and an edit, and briefs the next conversation on it', async () => {
    const { root } = await repo()
    const ingest = (event: string, extra: Record<string, unknown> = {}, conversationId = 'conv-1') =>
      ingestHook(payload(root, { conversationId, ...extra }), { now: () => NOW, agent: 'antigravity', event, cwd: '/elsewhere' })

    expect(await ingest('SessionStart')).toMatchObject({ status: 'recorded' })
    writeFileSync(join(root, 'src/app.ts'), 'export const app = 2\n')
    expect(await ingest('PostToolUse', { toolCall: { name: 'replace_file_content', args: { TargetFile: join(root, 'src/app.ts') } }, stepIdx: 3 })).toMatchObject({ status: 'recorded' })
    expect(await ingest('Stop', { executionNum: 0, terminationReason: 'model_stop', fullyIdle: true })).toMatchObject({ status: 'recorded' })

    const next = await ingest('SessionStart', {}, 'conv-2')
    expect(next.status === 'recorded' && next.additionalContext).toContain('Antigravity CLI session')
    expect(next.status === 'recorded' && next.additionalContext).toContain('`src/app.ts`')
    const { store } = await openWorkspace(root)
    try {
      expect(store.graph.get('session:conv-1')?.props.agent).toBe('antigravity')
    } finally {
      store.close()
    }
  })

  it('ignores a hook for an event or tool it does not use, without failing', async () => {
    const { root } = await repo()
    expect(await ingestHook(payload(root), { now: () => NOW, agent: 'antigravity', event: 'PreInvocation' })).toMatchObject({ status: 'ignored' })
    expect(await ingestHook(payload(root, { toolCall: { name: 'run_command', args: {} } }), { now: () => NOW, agent: 'antigravity', event: 'PostToolUse' })).toMatchObject({ status: 'ignored' })
    expect(await ingestHook(payload(root, { conversationId: '' }), { now: () => NOW, agent: 'antigravity', event: 'SessionStart' })).toMatchObject({ status: 'ignored' })
  })
})
