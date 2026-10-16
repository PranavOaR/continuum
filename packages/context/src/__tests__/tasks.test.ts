import type { ContinuumEvent } from '@continuum/core'
import { ContextStore } from '@continuum/store'
import { describe, expect, it } from 'vitest'
import { renderHandoff } from '../handoff'
import { projectState } from '../projectState'
import { currentTaskId, STALE_TASK_MS, taskSummaries } from '../tasks'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

let minute = 0
function task(payload: Extract<ContinuumEvent, { type: 'task.upserted' }>['payload']): ContinuumEvent {
  return { type: 'task.upserted', payload, evidence: 'agent-reported', source: 'mcp', occurredAt: new Date(NOW.getTime() - 20 * 60_000 + minute++ * 1000).toISOString() }
}

describe('tasks', () => {
  it('picks the most recently updated in-progress or blocked task as current', () => {
    const store = ContextStore.open(':memory:')
    expect(currentTaskId(store, NOW)).toBeUndefined()
    store.record(task({ id: 'a', title: 'A', status: 'in-progress' }))
    store.record(task({ id: 'b', title: 'B', status: 'blocked' }))
    expect(currentTaskId(store, NOW)).toBe('b')
    store.record(task({ id: 'b', title: 'B', status: 'completed' }))
    expect(currentTaskId(store, NOW)).toBe('a')
    store.record(task({ id: 'c', title: 'C', status: 'planned' }))
    expect(currentTaskId(store, NOW)).toBe('a')
    expect(taskSummaries(store).map((summary) => summary.id)).toEqual(['c', 'b', 'a'])
  })

  it('stops treating a task as current once it has gone stale', () => {
    const store = ContextStore.open(':memory:')
    store.record(task({ id: 'old', title: 'Old', status: 'in-progress' }))
    const updated = Date.parse(store.graph.get('task:old')?.updatedAt as string)
    expect(currentTaskId(store, new Date(updated + STALE_TASK_MS - 1000))).toBe('old')
    expect(currentTaskId(store, new Date(updated + STALE_TASK_MS + 1000))).toBeUndefined()
  })

  it('breaks timestamp ties by id, and ignores placeholder task nodes', () => {
    const store = ContextStore.open(':memory:')
    const at = NOW.toISOString()
    const same = (id: string) => ({ type: 'task.upserted', payload: { id, title: id, status: 'in-progress' }, evidence: 'agent-reported', source: 'mcp', occurredAt: at }) as ContinuumEvent
    store.recordAll([same('b'), same('a')])
    store.record({ type: 'session.started', payload: { sessionId: 's', agent: 'claude-code', taskId: 'ghost' }, evidence: 'observed', source: 'test', occurredAt: at })
    expect(currentTaskId(store, NOW)).toBe('a')
    expect(taskSummaries(store).map((summary) => summary.id)).toEqual(['a', 'b'])
  })

  it('shows the most recent completed steps in the handoff', () => {
    const store = seededStore()
    const steps = Array.from({ length: 12 }, (_unused, index) => `step ${index + 1}`)
    store.record(task({ id: 'long', title: 'Long', status: 'in-progress', completedSteps: steps }))
    const text = renderHandoff(projectState(store, tree(CURRENT_FILES), NOW), { now: NOW })
    expect(text).toContain('Done:\n  - …4 earlier\n  - step 5')
    expect(text).toContain('  - step 12')
  })

  it('lists files edited while the task was current', () => {
    const store = ContextStore.open(':memory:')
    store.record(task({ id: 'a', title: 'A', status: 'in-progress' }))
    store.record({ type: 'file.changed', payload: { path: 'src/x.ts', contentHash: 'h', changeType: 'modified', taskId: 'a' }, evidence: 'observed', source: 'test', occurredAt: NOW.toISOString() })
    expect(taskSummaries(store)[0].files).toEqual(['src/x.ts'])
  })

  it('leads the handoff with the current task, labelled as agent-reported', () => {
    const store = seededStore()
    store.record(
      task({
        id: 'oauth',
        title: 'Add Google sign-in',
        status: 'in-progress',
        objective: 'Users can sign in with Google',
        nextAction: 'Validate the state parameter',
        acceptanceCriteria: [
          { text: 'Callback creates a session', met: true },
          { text: 'State is validated', met: false },
        ],
        completedSteps: ['Callback route'],
        remainingSteps: ['State validation', 'Tests'],
      }),
    )
    const state = projectState(store, tree(CURRENT_FILES), NOW)
    expect(state.currentTaskId).toBe('oauth')
    const text = renderHandoff(state, { now: NOW })
    expect(text.indexOf('## Current task')).toBeLessThan(text.indexOf('## Where we left off'))
    expect(text).toContain('[agent-reported] "Add Google sign-in" (in-progress)')
    expect(text).toContain('Next action: "Validate the state parameter"')
    expect(text).toContain('  - [x] Callback creates a session')
    expect(text).toContain('  - [ ] State is validated')
    expect(text).toContain('Remaining:\n  - State validation\n  - Tests')
  })

  it('omits the section when no task is current', () => {
    const store = seededStore()
    store.record(task({ id: 'done', title: 'Done', status: 'completed' }))
    expect(renderHandoff(projectState(store, tree(CURRENT_FILES), NOW), { now: NOW })).not.toContain('## Current task')
  })
})
