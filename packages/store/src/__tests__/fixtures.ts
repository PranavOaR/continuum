import type { ContinuumEvent } from '@continuum/core'

let minute = 0
const at = () => new Date(Date.UTC(2026, 9, 16, 10, minute++)).toISOString()

type Body<T extends ContinuumEvent['type']> = Extract<ContinuumEvent, { type: T }>['payload']

function event<T extends ContinuumEvent['type']>(type: T, payload: Body<T>, evidence: ContinuumEvent['evidence'] = 'observed'): ContinuumEvent {
  return { type, payload, evidence, source: 'test', occurredAt: at(), revision: 'a3f9c21' } as ContinuumEvent
}

export const ev = {
  task: (id: string, title = 'Implement Google authentication') => event('task.upserted', { id, title, status: 'in-progress' }),
  sessionStart: (sessionId: string, taskId?: string) => event('session.started', { sessionId, agent: 'claude-code', taskId }),
  sessionProgress: (sessionId: string, note: string) => event('session.progress', { sessionId, note }, 'agent-reported'),
  sessionEnd: (sessionId: string, summary?: string) => event('session.ended', { sessionId, summary }, 'agent-reported'),
  file: (path: string, contentHash: string | null, extra: { sessionId?: string; taskId?: string } = {}) =>
    event('file.changed', { path, contentHash, changeType: contentHash ? 'modified' : 'deleted', ...extra }),
  check: (name: string, exitCode: number, ranAgainst: Record<string, string>) =>
    event('check.recorded', { name, command: name, exitCode, durationMs: 1200, ranAgainst }, 'verified'),
  memory: (id: string, anchors: Record<string, string>, taskId?: string) =>
    event('memory.recorded', { id, kind: 'decision', title: 'Callbacks use the session service', body: 'Reuse createSession.', taskId, anchors }),
}
