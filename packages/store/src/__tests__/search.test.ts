import type { ContinuumEvent } from '@continuum/core'
import { afterEach, describe, expect, it } from 'vitest'
import { ContextStore } from '../contextStore'
import { forgetTextBefore } from '../forget'
import { searchGraph, tokenize } from '../search'

const AT = '2026-10-01T10:00:00.000Z'
const stores: ContextStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

const memory = (id: string, title: string, body: string, taskId?: string): ContinuumEvent => ({
  type: 'memory.recorded',
  payload: { id, kind: 'decision', title, body, anchors: {}, ...(taskId ? { taskId } : {}) },
  evidence: 'agent-reported',
  source: 'test',
  occurredAt: AT,
})

function seeded(): ContextStore {
  const store = ContextStore.open(':memory:')
  stores.push(store)
  store.recordAll([
    { type: 'task.upserted', payload: { id: 'billing', title: 'Invoice export', status: 'completed', objective: 'Export invoices as CSV', remainingSteps: ['Handle refunds'] }, evidence: 'agent-reported', source: 'test', occurredAt: AT },
    { type: 'task.upserted', payload: { id: 'auth', title: 'Google sign-in', status: 'in-progress', nextAction: 'Validate the state parameter' }, evidence: 'agent-reported', source: 'test', occurredAt: AT },
    memory('idempotency', 'Retries are safe', 'Every webhook handler checks the idempotency key before writing, so the provider can retry.', 'billing'),
    memory('cookies', 'Session cookies are HttpOnly', 'sessionCookie is set by createSession only.', 'auth'),
    memory('pnpm', 'Use pnpm', 'Workspaces need hoisting turned off.'),
    { type: 'session.started', payload: { sessionId: 's1', agent: 'codex' }, evidence: 'observed', source: 'test', occurredAt: AT },
    { type: 'session.progress', payload: { sessionId: 's1', note: 'Wired the webhook route; refunds still fail.' }, evidence: 'agent-reported', source: 'test', occurredAt: AT },
  ])
  return store
}

const keysOf = (store: ContextStore, query: string, options?: Parameters<typeof searchGraph>[2]) => searchGraph(store.graph, query, options).map((hit) => hit.key)

describe('tokenize', () => {
  it('lower-cases, splits identifiers and trims common endings', () => {
    expect(tokenize('sessionCookie get_context Hoisting')).toEqual(['session', 'cookie', 'get', 'context', 'hoist'])
  })
})

describe('searchGraph', () => {
  it('finds an old decision on another task by a word in its body', () => {
    expect(keysOf(seeded(), 'idempotency')).toEqual(['memory:idempotency'])
  })

  it('matches word endings and identifiers, and ranks a title match above a body match', () => {
    const store = seeded()
    expect(keysOf(store, 'hoisted workspace')).toEqual(['memory:pnpm'])
    expect(keysOf(store, 'session cookie')[0]).toBe('memory:cookies')
    store.record(memory('other', 'Unrelated', 'We also talked about pnpm once.'))
    expect(keysOf(store, 'pnpm')).toEqual(['memory:pnpm', 'memory:other'])
  })

  it('searches task text and session notes too, and can be kept to one kind', () => {
    const store = seeded()
    expect(keysOf(store, 'refunds').sort()).toEqual(['session:s1', 'task:billing'])
    expect(keysOf(store, 'refunds', { kinds: ['session'] })).toEqual(['session:s1'])
    expect(keysOf(store, 'state parameter')).toEqual(['task:auth'])
  })

  it('says which words matched and what share of the query they are', () => {
    const [hit] = searchGraph(seeded().graph, 'idempotency kubernetes')
    expect(hit).toMatchObject({ key: 'memory:idempotency', matched: ['idempotency'], coverage: 0.5 })
    expect(hit.score).toBeGreaterThan(0)
  })

  it('returns nothing for a query with no words, or words nothing holds', () => {
    const store = seeded()
    expect(searchGraph(store.graph, '   ')).toEqual([])
    expect(searchGraph(store.graph, '!!! ---')).toEqual([])
    expect(searchGraph(store.graph, 'kubernetes')).toEqual([])
  })

  it('ignores filler words unless they are the whole query', () => {
    const store = seeded()
    expect(keysOf(store, 'the idempotency of it')).toEqual(['memory:idempotency'])
    expect(keysOf(store, 'the').length).toBeGreaterThan(0)
  })

  it('respects the limit, best first', () => {
    const store = seeded()
    for (let index = 0; index < 30; index += 1) store.record(memory(`m${index}`, `Note ${index}`, 'webhook'))
    expect(searchGraph(store.graph, 'webhook')).toHaveLength(10)
    expect(searchGraph(store.graph, 'webhook', { limit: 3 })).toHaveLength(3)
  })

  it('no longer finds text that was forgotten', () => {
    const store = seeded()
    expect(keysOf(store, 'wired')).toEqual(['session:s1'])
    store.rewriteHistory(forgetTextBefore(new Date('2026-11-01T00:00:00.000Z')))
    expect(searchGraph(store.graph, 'wired')).toEqual([])
  })
})
