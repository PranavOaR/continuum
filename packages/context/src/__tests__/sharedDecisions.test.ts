import { SHARE_SOURCE, SHARED_SOURCE, type ContinuumEvent } from '@continuum/core'
import { ContextStore } from '@continuum/store'
import { describe, expect, it } from 'vitest'
import { renderHandoff } from '../handoff'
import { projectState } from '../projectState'
import { sinceYouLeft } from '../sinceYouLeft'
import { NOW, tree } from './fixtures'

const HASH = 'c'.repeat(64)
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

const decision = (id: string, title: string, minutes: number, source: string, sharedHash?: string): ContinuumEvent => ({
  type: 'memory.recorded',
  payload: { id, kind: 'decision', title, body: '', anchors: {}, ...(sharedHash ? { sharedHash } : {}) },
  evidence: 'agent-reported',
  source,
  occurredAt: minutesAgo(minutes),
})

describe('decisions shared through the repository', () => {
  it('says in the briefing which decisions are shared in the repository', () => {
    const store = ContextStore.open(':memory:')
    store.recordAll([decision('mine', 'Only mine', 20, 'mcp'), decision('team', 'Tax rounds to the cent', 10, SHARED_SOURCE, HASH)])
    const state = projectState(store, tree({}), NOW)
    expect(state.decisions.find((summary) => summary.id === 'team')?.shared).toBe(true)
    expect(state.decisions.find((summary) => summary.id === 'mine')?.shared).toBe(false)
    const text = renderHandoff(state, { now: NOW })
    expect(text).toContain('- [agent-reported] Decision: Tax rounds to the cent. (shared in the repository)')
    expect(text).toContain('- [agent-reported] Decision: Only mine.')
    expect(text).not.toContain('Only mine. (shared')
  })

  it('tells a returning agent about a teammate’s decision, but not about you sharing your own', () => {
    const store = ContextStore.open(':memory:')
    store.recordAll([
      { type: 'session.started', payload: { sessionId: 'before', agent: 'codex' }, evidence: 'observed', source: 'test', occurredAt: minutesAgo(120) },
      { type: 'session.ended', payload: { sessionId: 'before' }, evidence: 'observed', source: 'test', occurredAt: minutesAgo(110) },
      decision('mine', 'Use pnpm', 100, 'mcp'),
      decision('mine', 'Use pnpm', 60, SHARE_SOURCE, HASH),
      decision('team', 'Tax rounds to the cent', 50, SHARED_SOURCE, HASH),
      { type: 'session.started', payload: { sessionId: 'now', agent: 'codex' }, evidence: 'observed', source: 'test', occurredAt: minutesAgo(1) },
    ])
    const since = sinceYouLeft(store, 'codex', 'now')
    expect(since?.decisions.map((entry) => entry.title)).toEqual(['Use pnpm', 'Tax rounds to the cent'])
    expect(since?.decisions.find((entry) => entry.title === 'Use pnpm')?.at).toBe(minutesAgo(100))
    const text = renderHandoff(projectState(store, tree({}), NOW, { excludeSessionId: 'now' }), { now: NOW, since: since ?? undefined })
    expect(text).toContain('- [agent-reported] Shared in the repository: "Tax rounds to the cent"')
    expect(text).toContain('- [agent-reported] Decision recorded: "Use pnpm"')
  })
})
