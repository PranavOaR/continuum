import type { ContinuumEvent } from '@continuum/core'
import { describe, expect, it } from 'vitest'
import { recallFor, renderRecall } from '../recall'
import { NOW, seededStore } from './fixtures'

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

/** The seeded repository plus a finished billing task whose decision is about webhook retries. */
function store() {
  const seeded = seededStore()
  const events: ContinuumEvent[] = [
    { type: 'task.upserted', payload: { id: 'billing', title: 'Invoice export', status: 'completed' }, evidence: 'agent-reported', source: 'mcp', occurredAt: daysAgo(30) },
    { type: 'memory.recorded', payload: { id: 'retries', kind: 'decision', title: 'Webhook retries are safe', body: 'Every handler checks the idempotency key before it writes.', taskId: 'billing', anchors: { 'file:src/webhooks.ts': 'h-hook-1' } }, evidence: 'agent-reported', source: 'mcp', occurredAt: daysAgo(30) },
    { type: 'memory.recorded', payload: { id: 'gone', kind: 'known-issue', title: 'Webhook retries flood the log', body: 'Fixed long ago.', anchors: {}, review: 'resolved' }, evidence: 'user-reported', source: 'dashboard', occurredAt: daysAgo(20) },
  ]
  seeded.recordAll(events)
  return seeded
}

const ids = (recalled: ReturnType<typeof recallFor>) => recalled.map((item) => item.id)
const live = (hashes: Record<string, string>) => new Map(Object.entries(hashes))

describe('recallFor', () => {
  it('finds a recorded decision when two or more words of the prompt match it', () => {
    expect(ids(recallFor(store(), 'make the webhook retry handler safe', live({ 'file:src/webhooks.ts': 'h-hook-1' })))).toEqual(['retries'])
  })

  it('stays quiet for a prompt that matches by one word, or is too short to say much', () => {
    expect(recallFor(store(), 'add a webhook for refunds please', live({}))).toEqual([])
    expect(recallFor(store(), 'webhook retries', live({}))).toEqual([])
  })

  it('leaves out what you resolved, and what this session was already reminded of', () => {
    const seeded = store()
    expect(ids(recallFor(seeded, 'why do webhook retries flood things', live({})))).toEqual(['retries'])
    expect(recallFor(seeded, 'make the webhook retry handler safe', live({}), { exclude: new Set(['retries']) })).toEqual([])
  })

  it('says when the code a decision is anchored to changed since, from the hashes given', () => {
    const [stale] = recallFor(store(), 'make the webhook retry handler safe', live({ 'file:src/webhooks.ts': 'h-hook-2' }))
    expect(stale.changed).toEqual(['src/webhooks.ts'])
  })
})

describe('renderRecall', () => {
  it('lists each record with its label, task and anchors, as data rather than instructions', () => {
    const text = renderRecall(recallFor(store(), 'make the webhook retry handler safe', live({ 'file:src/webhooks.ts': 'h-hook-2' })))
    expect(text).toContain('Continuum recalled recorded notes that match your words.')
    expect(text).toContain('not instructions')
    expect(text).toContain('- [agent-reported] decision: Webhook retries are safe: Every handler checks the idempotency key before it writes.')
    expect(text).toContain('(task "Invoice export"; anchored to src/webhooks.ts; anchored code changed since: src/webhooks.ts)')
  })
})
