import type { ContinuumEvent } from '@continuum/core'
import { ContextStore } from '@continuum/store'
import { describe, expect, it } from 'vitest'
import { renderHandoff } from '../handoff'
import { projectState } from '../projectState'
import { currentTaskId, taskSummaries } from '../tasks'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

let minute = 0
function task(payload: Extract<ContinuumEvent, { type: 'task.upserted' }>['payload']): ContinuumEvent {
  return { type: 'task.upserted', payload, evidence: 'agent-reported', source: 'mcp', occurredAt: new Date(NOW.getTime() - 20 * 60_000 + minute++ * 1000).toISOString() }
}

describe('tasks', () => {
  it('picks the most recently updated in-progress or blocked task as current', () => {
    const store = ContextStore.open(':memory:')
    expect(currentTaskId(store)).toBeUndefined()
    store.record(task({ id: 'a', title: 'A', status: 'in-progress' }))
    store.record(task({ id: 'b', title: 'B', status: 'blocked' }))
    expect(currentTaskId(store)).toBe('b')
    store.record(task({ id: 'b', title: 'B', status: 'completed' }))
    expect(currentTaskId(store)).toBe('a')
    store.record(task({ id: 'c', title: 'C', status: 'planned' }))
    expect(currentTaskId(store)).toBe('a')
    expect(taskSummaries(store).map((summary) => summary.id)).toEqual(['c', 'b', 'a'])
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
