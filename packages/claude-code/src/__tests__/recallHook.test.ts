import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { initWorkspace, openWorkspace, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { ingestHook } from '../ingest'

const NOW = new Date('2026-11-11T12:00:00.000Z')
const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

async function repo() {
  const created = createSandbox({ 'src/webhooks.ts': 'export const handle = () => 1\n' })
  sandboxes.push(created)
  const { store } = await initWorkspace(created.root)
  await scanRepository(store, created.root)
  const hash = created.git('hash-object', 'src/webhooks.ts')
  store.record({ type: 'memory.recorded', payload: { id: 'retries', kind: 'decision', title: 'Webhook retries are safe for ACME-123456', body: 'Handlers check the idempotency key.', anchors: { 'file:src/webhooks.ts': hash } }, evidence: 'agent-reported', source: 'mcp', occurredAt: NOW.toISOString() })
  store.close()
  return created
}

const prompt = (root: string, text: string, session = 's1') => JSON.stringify({ session_id: session, cwd: root, transcript_path: '/t.jsonl', hook_event_name: 'UserPromptSubmit', prompt: text })
const context = (outcome: Awaited<ReturnType<typeof ingestHook>>) => (outcome.status === 'recorded' ? outcome.additionalContext : undefined)

describe('recall on a prompt', () => {
  it('adds the matching decision to the prompt, masked by the repository rules, once per session', async () => {
    const { root } = await repo()
    writeFileSync(join(root, '.continuum', 'config.json'), JSON.stringify({ redactPatterns: ['ACME-[0-9]{6}'] }))
    const first = await ingestHook(prompt(root, 'make the webhook retry handler safe'), { now: () => NOW })
    expect(first).toMatchObject({ status: 'recorded', hookEvent: 'UserPromptSubmit' })
    expect(context(first)).toContain('decision: Webhook retries are safe for [redacted]')
    expect(context(first)).not.toContain('ACME-123456')
    expect(context(await ingestHook(prompt(root, 'is the webhook retry handler safe now?'), { now: () => NOW }))).toBeUndefined()
    expect(context(await ingestHook(prompt(root, 'make the webhook retry handler safe', 's2'), { now: () => NOW }))).toContain('Webhook retries are safe')
  })

  it('says when the anchored code changed since the decision', async () => {
    const { root } = await repo()
    writeFileSync(join(root, 'src/webhooks.ts'), 'export const handle = () => 2\n')
    expect(context(await ingestHook(prompt(root, 'make the webhook retry handler safe'), { now: () => NOW }))).toContain('anchored code changed since: src/webhooks.ts')
  })

  it('stays quiet when recall is off, and still records the prompt when prompt capture is on', async () => {
    const { root } = await repo()
    writeFileSync(join(root, '.continuum', 'config.json'), JSON.stringify({ recall: false, capturePrompts: true }))
    const outcome = await ingestHook(prompt(root, 'make the webhook retry handler safe'), { now: () => NOW })
    expect(context(outcome)).toBeUndefined()
    const { store } = await openWorkspace(root)
    try {
      expect(store.graph.get('session:s1')?.props.lastPrompt).toBe('make the webhook retry handler safe')
    } finally {
      store.close()
    }
  })

  it('ignores a prompt that matches nothing, recording nothing', async () => {
    const { root } = await repo()
    expect(await ingestHook(prompt(root, 'rename the readme heading'), { now: () => NOW })).toMatchObject({ status: 'ignored' })
    expect(readFileSync(join(root, 'src/webhooks.ts'), 'utf8')).toContain('() => 1')
  })
})
