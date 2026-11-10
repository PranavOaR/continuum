import type { ContinuumEvent } from '@continuum/core'
import { describe, expect, it } from 'vitest'
import { projectState } from '../projectState'
import { rankContext } from '../retrieve'
import { renderSearch, searchMemory, shareable } from '../search'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

/** The seeded repository plus a finished billing task with an old decision of its own, and a task in progress. */
function withHistory() {
  const store = seededStore()
  const events: ContinuumEvent[] = [
    { type: 'task.upserted', payload: { id: 'billing', title: 'Invoice export', status: 'completed', objective: 'Export invoices as CSV' }, evidence: 'agent-reported', source: 'mcp', occurredAt: daysAgo(40) },
    {
      type: 'memory.recorded',
      payload: { id: 'idempotency', kind: 'decision', title: 'Retries are safe', body: 'Every webhook handler checks the idempotency key before writing.', taskId: 'billing', anchors: { 'file:src/auth/session.ts': 'h-session-1' } },
      evidence: 'agent-reported',
      source: 'mcp',
      occurredAt: daysAgo(40),
    },
    { type: 'memory.recorded', payload: { id: 'yours', kind: 'known-issue', title: 'Webhook signatures expire', body: 'After five minutes.', anchors: {} }, evidence: 'user-reported', source: 'dashboard', occurredAt: daysAgo(2) },
    { type: 'task.upserted', payload: { id: 'callback', title: 'Google callback', status: 'in-progress', nextAction: 'Validate state' }, evidence: 'agent-reported', source: 'mcp', occurredAt: daysAgo(0) },
  ]
  store.recordAll(events)
  return store
}

const search = (store: ReturnType<typeof withHistory>, query: string, files: Record<string, string> = CURRENT_FILES) =>
  searchMemory(store, projectState(store, tree(files), NOW), query)

describe('searchMemory', () => {
  it('finds an old decision on another task by a word in its body, with its label, task and anchors', () => {
    const [result, ...rest] = search(withHistory(), 'idempotency')
    expect(rest).toEqual([])
    expect(result).toMatchObject({ kind: 'decision', id: 'idempotency', title: 'Retries are safe', evidence: 'agent-reported', task: 'Invoice export', anchors: ['src/auth/session.ts'], changed: [], resolved: false })
  })

  it('labels what you wrote as yours, and says when the anchored code changed since', () => {
    const store = withHistory()
    expect(search(store, 'signatures')[0]).toMatchObject({ kind: 'known-issue', evidence: 'user-reported' })
    const [stale] = search(store, 'idempotency', { ...CURRENT_FILES, 'src/auth/session.ts': 'h-session-2' })
    expect(stale.changed).toEqual(['src/auth/session.ts'])
    expect(renderSearch([stale], 'idempotency', NOW)).toContain('anchored code changed since: src/auth/session.ts')
  })

  it('still finds a record you resolved, and says so', () => {
    const store = withHistory()
    store.record({ type: 'memory.recorded', payload: { id: 'yours', kind: 'known-issue', title: 'Webhook signatures expire', body: 'After five minutes.', anchors: {}, review: 'resolved' }, evidence: 'user-reported', source: 'dashboard', occurredAt: daysAgo(1) })
    expect(search(store, 'signatures')[0].resolved).toBe(true)
    expect(renderSearch(search(store, 'signatures'), 'signatures', NOW)).toContain('resolved by you')
  })

  it('finds tasks and session notes too', () => {
    const store = withHistory()
    expect(search(store, 'invoices CSV')[0]).toMatchObject({ kind: 'task', id: 'billing', title: 'Invoice export', evidence: 'agent-reported', status: 'completed' })
    expect(search(store, 'state parameter').map((result) => result.kind)).toContain('session')
  })
})

describe('shareable', () => {
  it("masks text with today's redaction rules and drops anchors into ignored paths", () => {
    const results = shareable(search(withHistory(), 'idempotency', { ...CURRENT_FILES, 'src/auth/session.ts': 'h-session-2' }), { redact: (text) => text.replaceAll('idempotency', '[redacted]'), isIgnored: (path) => path === 'src/auth/session.ts' })
    expect(results[0].body).toBe('Every webhook handler checks the [redacted] key before writing.')
    expect(results[0].anchors).toEqual([])
    expect(results[0].changed).toEqual([])
  })
})

describe('renderSearch', () => {
  it('prints each result with its evidence label, and says when nothing matched', () => {
    const store = withHistory()
    const text = renderSearch(search(store, 'idempotency'), 'idempotency', NOW)
    expect(text).toContain('1 record matches "idempotency"')
    expect(text).toContain('[agent-reported] decision: Retries are safe')
    expect(text).toContain('Every webhook handler checks the idempotency key before writing.')
    expect(text).toContain('task "Invoice export"')
    expect(text).toContain('anchored to src/auth/session.ts')
    expect(renderSearch([], 'kubernetes', NOW)).toContain('Nothing recorded matches "kubernetes"')
  })
})

describe('rankContext with a query', () => {
  it('lifts an on-topic decision from another task above off-topic ones, and says why', () => {
    const store = withHistory()
    const state = projectState(store, tree(CURRENT_FILES), NOW)
    const position = (query?: string) => {
      const decisions = rankContext(store, state, { now: NOW, ...(query ? { query } : {}) }).filter((item) => item.kind === 'decision')
      return { index: decisions.findIndex((item) => item.text.includes('Retries are safe')), item: decisions.find((item) => item.text.includes('Retries are safe')) }
    }
    // Forty days old and on a finished task: last among the decisions without a query.
    expect(position().index).toBe(2)
    expect(position('idempotency key').index).toBe(0)
    expect(position('idempotency key').item?.why).toContain('matches "idempotency", "key"')
  })

  it('changes nothing when no word of the query is recorded', () => {
    const store = withHistory()
    const state = projectState(store, tree(CURRENT_FILES), NOW)
    expect(rankContext(store, state, { now: NOW, query: 'kubernetes' })).toEqual(rankContext(store, state, { now: NOW }))
  })
})
