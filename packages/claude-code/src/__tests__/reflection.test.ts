import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initWorkspace, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { ingestHook } from '../ingest'

const NOW = new Date('2026-11-11T12:00:00.000Z')
const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

async function repo(config: Record<string, unknown>) {
  const created = createSandbox({ 'src/app.ts': 'export const app = 1\n' })
  sandboxes.push(created)
  const { store } = await initWorkspace(created.root)
  await scanRepository(store, created.root)
  store.close()
  writeFileSync(join(created.root, '.continuum', 'config.json'), JSON.stringify(config))
  return created
}

const hook = (root: string, fields: Record<string, unknown>, session = 's1') => JSON.stringify({ session_id: session, cwd: root, transcript_path: '/t.jsonl', ...fields })

/** A session that edits src/app.ts, as Claude Code reports it. */
async function editingSession(root: string, session = 's1') {
  await ingestHook(hook(root, { hook_event_name: 'SessionStart', source: 'startup' }, session), { now: () => NOW })
  writeFileSync(join(root, 'src/app.ts'), `export const app = ${session.length + 1}\n`)
  await ingestHook(hook(root, { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(root, 'src/app.ts') } }, session), { now: () => NOW })
}

const stop = (root: string, session = 's1') => ingestHook(hook(root, { hook_event_name: 'Stop', last_assistant_message: 'Done.' }, session), { now: () => NOW })
const reflect = (outcome: Awaited<ReturnType<typeof ingestHook>>) => (outcome.status === 'recorded' ? outcome.reflect : undefined)

describe('end-of-session reflection', () => {
  it('is off unless turned on: Stop never asks the agent to go on', async () => {
    const { root } = await repo({})
    await editingSession(root)
    expect(reflect(await stop(root))).toBeUndefined()
  })

  it('when on, asks once per session that changed files to record its decisions, then lets it stop', async () => {
    const { root } = await repo({ reflection: true })
    await editingSession(root)
    const asked = reflect(await stop(root))
    expect(asked).toContain('record_decision')
    expect(asked).toContain('src/app.ts')
    expect(reflect(await stop(root))).toBeUndefined()
  })

  it('does not ask a session that changed nothing', async () => {
    const { root } = await repo({ reflection: true })
    await ingestHook(hook(root, { hook_event_name: 'SessionStart', source: 'startup' }), { now: () => NOW })
    expect(reflect(await stop(root))).toBeUndefined()
  })

  it('does not ask Codex, Copilot or Antigravity, which have no way to go on from a stop', async () => {
    const { root } = await repo({ reflection: true })
    await editingSession(root)
    const codex = await ingestHook(hook(root, { hook_event_name: 'Stop' }), { now: () => NOW, agent: 'codex' })
    expect(reflect(codex)).toBeUndefined()
  })
})
