import type { ContinuumEvent } from '@continuum/core'
import { describe, expect, it } from 'vitest'
import { taskReplay } from '../replay'

const at = (minute: number) => new Date(Date.UTC(2026, 10, 11, 9, minute)).toISOString()
const e = (type: ContinuumEvent['type'], payload: Record<string, unknown>, minute: number, evidence: ContinuumEvent['evidence'] = 'observed', source = 'test'): ContinuumEvent =>
  ({ type, payload, evidence, source, occurredAt: at(minute) }) as ContinuumEvent

/** A task Claude Code starts, Codex takes up, a person edits by hand, and Claude finishes. */
const HISTORY: ContinuumEvent[] = [
  e('file.changed', { path: 'src/auth.ts', contentHash: 'h0', changeType: 'added' }, 0, 'observed', 'watcher:git'),
  e('task.upserted', { id: 'other', title: 'Unrelated', status: 'in-progress' }, 1, 'agent-reported', 'mcp'),
  e('session.started', { sessionId: 'claude-1', agent: 'claude-code', taskId: 'auth' }, 2),
  e('task.upserted', { id: 'auth', title: 'Add sign-in', status: 'in-progress', nextAction: 'Write the callback', remainingSteps: ['Callback', 'Tests'] }, 3, 'agent-reported', 'mcp'),
  e('file.changed', { path: 'src/auth.ts', contentHash: 'h1', changeType: 'modified', sessionId: 'claude-1', taskId: 'auth' }, 4),
  e('check.recorded', { name: 'unit', command: 'npm test', exitCode: 0, durationMs: 900, ranAgainst: { 'file:src/auth.ts': 'h1' } }, 5, 'verified', 'cli'),
  e('check.recorded', { name: 'lint', command: 'npm run lint', exitCode: 0, durationMs: 300, ranAgainst: { 'file:README.md': 'r1' } }, 6, 'verified', 'cli'),
  e('memory.recorded', { id: 'd1', kind: 'decision', title: 'Sessions live 7 days', body: '', taskId: 'auth', anchors: {} }, 7, 'agent-reported', 'mcp'),
  e('session.ended', { sessionId: 'claude-1', summary: 'Callback written. Next: tests.' }, 8, 'agent-reported'),
  e('file.changed', { path: 'src/auth.ts', contentHash: 'h2', changeType: 'modified' }, 9, 'observed', 'watcher:git'),
  e('session.started', { sessionId: 'codex-1', agent: 'codex' }, 10),
  e('session.task', { sessionId: 'codex-1', taskId: 'auth' }, 11),
  e('check.recorded', { name: 'unit', command: 'npm test', exitCode: 1, durationMs: 800, ranAgainst: { 'file:src/auth.ts': 'h2' } }, 12, 'observed', 'adapter:codex'),
  e('task.upserted', { id: 'auth', title: 'Add sign-in', status: 'completed', remainingSteps: [], completedSteps: ['Callback', 'Tests'] }, 13, 'agent-reported', 'mcp'),
  e('file.changed', { path: 'src/auth.ts', contentHash: 'h3', changeType: 'modified' }, 14, 'observed', 'watcher:git'),
]

const titles = (events: readonly ContinuumEvent[] = HISTORY) => taskReplay(events, 'auth').steps.map((step) => step.title)

describe('taskReplay', () => {
  it('tells the task in order: who worked on it, what changed, what ran, and where it went stale', () => {
    expect(titles()).toEqual([
      'Claude Code session started',
      'Task started: Add sign-in',
      'Claude Code edited src/auth.ts',
      'unit passed',
      'Decision recorded: Sessions live 7 days',
      'Claude Code session ended',
      'src/auth.ts changed outside an agent session',
      'unit went out of date',
      'Codex session took up the task',
      'unit failed',
      'Step done: Callback',
      'Step done: Tests',
      'Task completed',
    ])
  })

  it('leaves out checks that never covered the task files, other tasks, and anything after it was completed', () => {
    const all = titles()
    expect(all.some((title) => title.startsWith('lint'))).toBe(false)
    expect(all.some((title) => title.includes('Unrelated'))).toBe(false)
    expect(all.filter((title) => title.includes('changed outside'))).toHaveLength(1)
  })

  it('says why a check went stale, labels each step by how it is known, and names the agent', () => {
    const { steps } = taskReplay(HISTORY, 'auth')
    expect(steps.find((step) => step.title === 'unit went out of date')).toMatchObject({ kind: 'stale', detail: 'It passed against src/auth.ts, which has changed since.', tone: 'warn' })
    expect(steps.find((step) => step.title === 'unit passed')).toMatchObject({ kind: 'check', evidence: 'verified', tone: 'good', detail: '`npm test`' })
    expect(steps.find((step) => step.title === 'unit failed')).toMatchObject({ evidence: 'observed', tone: 'bad' })
    expect(steps.find((step) => step.title === 'Claude Code session ended')).toMatchObject({ kind: 'note', detail: 'Callback written. Next: tests.', evidence: 'agent-reported', agent: 'claude-code' })
    expect(steps.find((step) => step.title.startsWith('Codex'))?.agent).toBe('codex')
  })

  it('summarises the agents, edits, checks and stale moments', () => {
    expect(taskReplay(HISTORY, 'auth').summary).toEqual({ agents: ['claude-code', 'codex'], edits: 2, checks: 2, stale: 1, decisions: 1 })
  })

  it('reports status changes and finished steps as they happen', () => {
    const events = [
      ...HISTORY.slice(0, 5),
      e('task.upserted', { id: 'auth', title: 'Add sign-in', status: 'blocked', nextAction: 'Wait for keys', remainingSteps: ['Tests'], completedSteps: ['Callback'] }, 6, 'user-reported', 'dashboard'),
    ]
    const { steps } = taskReplay(events, 'auth')
    expect(steps.at(-2)).toMatchObject({ title: 'Step done: Callback', kind: 'task' })
    expect(steps.at(-1)).toMatchObject({ title: 'Status: blocked', detail: 'Next: Wait for keys', evidence: 'user-reported' })
  })

  it('is empty for a task the log does not hold', () => {
    expect(taskReplay(HISTORY, 'nope').steps).toEqual([])
  })
})
