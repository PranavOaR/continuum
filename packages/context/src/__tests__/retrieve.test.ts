import { describe, expect, it } from 'vitest'
import { projectState } from '../projectState'
import { rankContext, renderContext } from '../retrieve'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

function withTask() {
  const store = seededStore()
  store.record({
    type: 'task.upserted',
    payload: { id: 'callback', title: 'Google callback', status: 'in-progress', nextAction: 'Validate state', remainingSteps: ['Validate state'] },
    evidence: 'agent-reported',
    source: 'mcp',
    occurredAt: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
  })
  // The task touched the callback file.
  store.record({
    type: 'file.changed',
    payload: { path: 'src/auth/callback.ts', contentHash: 'h-callback-1', changeType: 'modified', sessionId: 'latest', taskId: 'callback' },
    evidence: 'observed',
    source: 'test',
    occurredAt: new Date(NOW.getTime() - 19 * 60_000).toISOString(),
  })
  return store
}

describe('rankContext', () => {
  it('puts the task first, then what needs action on its files, then the rest', () => {
    const store = withTask()
    const items = rankContext(store, projectState(store, tree(CURRENT_FILES), NOW), { now: NOW })
    expect(items[0]).toMatchObject({ kind: 'task', text: expect.stringContaining('"Google callback" (in-progress)') })
    const e2e = items.findIndex((item) => item.text.includes('e2e'))
    const unit = items.findIndex((item) => item.text.includes('unit'))
    // e2e covers the task's file and is out of date; unit passed and covers other files.
    expect(items[e2e]).toMatchObject({ why: expect.stringContaining('needs action; covers task files') })
    expect(e2e).toBeLessThan(unit)
    expect(items.map((item) => item.score)).toEqual([...items.map((item) => item.score)].sort((a, b) => b - a))
  })

  it('flags a decision whose anchored code changed as needing attention', () => {
    const store = withTask()
    const state = projectState(store, tree({ ...CURRENT_FILES, 'src/auth/session.ts': 'h-session-2' }), NOW)
    const decision = rankContext(store, state, { now: NOW }).find((item) => item.kind === 'decision')
    expect(decision).toMatchObject({ why: expect.stringContaining('its code changed'), text: expect.stringContaining('[anchored code changed: src/auth/session.ts]') })
  })
})

describe('renderContext', () => {
  it('fills the budget best-first and says how much it left out', () => {
    const store = withTask()
    const items = rankContext(store, projectState(store, tree(CURRENT_FILES), NOW), { now: NOW })
    const small = renderContext(items, 80)
    expect(small).toContain('Google callback')
    expect(small).toMatch(/\(\d+ lower-ranked items? left out; raise budget_tokens to see more\.\)/)
    expect(renderContext(items, 4_000)).not.toContain('left out')
    expect(renderContext([], 500)).toContain('Nothing recorded yet.')
  })
})
