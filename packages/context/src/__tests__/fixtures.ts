import type { ContinuumEvent } from '@continuum/core'
import type { WorkingTree } from '@continuum/capture'
import { ContextStore } from '@continuum/store'

export const NOW = new Date('2026-10-16T12:00:00.000Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

type Body<T extends ContinuumEvent['type']> = Extract<ContinuumEvent, { type: T }>['payload']
function event<T extends ContinuumEvent['type']>(type: T, payload: Body<T>, minutes: number, evidence: ContinuumEvent['evidence'] = 'observed'): ContinuumEvent {
  return { type, payload, evidence, source: 'test', occurredAt: minutesAgo(minutes) } as ContinuumEvent
}

export function tree(files: Record<string, string>, revision: string | null = 'a3f9c21'): WorkingTree {
  return { root: '/work/acme-app', revision, files: new Map(Object.entries(files)) }
}

/**
 * Two Claude Code sessions on a repo: the older one finished auth, the latest
 * one is mid-way through the callback, with one check passed and one stale.
 */
export function seededStore(): ContextStore {
  const store = ContextStore.open(':memory:')
  store.recordAll([
    event('file.changed', { path: 'src/auth/login.ts', contentHash: 'h-login-0', changeType: 'added' }, 300),
    event('file.changed', { path: 'src/auth/session.ts', contentHash: 'h-session-1', changeType: 'added' }, 300),
    event('file.changed', { path: 'README.md', contentHash: 'h-readme', changeType: 'added' }, 300),
    event('session.started', { sessionId: 'old', agent: 'claude-code' }, 240),
    event('file.changed', { path: 'src/auth/session.ts', contentHash: 'h-session-1', changeType: 'modified', sessionId: 'old' }, 230),
    event('session.ended', { sessionId: 'old', summary: 'Session service done' }, 200, 'agent-reported'),
    event('session.started', { sessionId: 'latest', agent: 'claude-code' }, 60),
    event('file.changed', { path: 'src/auth/login.ts', contentHash: 'h-login-1', changeType: 'modified', sessionId: 'latest' }, 50),
    event('file.changed', { path: 'src/auth/callback.ts', contentHash: 'h-callback-1', changeType: 'added', sessionId: 'latest' }, 45),
    event(
      'check.recorded',
      { name: 'unit', command: 'npm test', exitCode: 0, durationMs: 900, ranAgainst: { 'file:src/auth/login.ts': 'h-login-1', 'file:src/auth/session.ts': 'h-session-1' } },
      40,
      'verified',
    ),
    event(
      'check.recorded',
      { name: 'e2e', command: 'npm run e2e', exitCode: 1, durationMs: 4000, ranAgainst: { 'file:src/auth/callback.ts': 'h-callback-0' } },
      55,
      'verified',
    ),
    event(
      'memory.recorded',
      { id: 'reuse-session', kind: 'decision', title: 'Callbacks reuse createSession', body: 'Do not mint tokens in the callback.', anchors: { 'file:src/auth/session.ts': 'h-session-1' } },
      35,
      'agent-reported',
    ),
    event('session.progress', { sessionId: 'latest', note: 'Callback route wired. Next: validate the state parameter.' }, 30, 'agent-reported'),
  ])
  return store
}

export const CURRENT_FILES = {
  'src/auth/login.ts': 'h-login-1',
  'src/auth/session.ts': 'h-session-1',
  'src/auth/callback.ts': 'h-callback-1',
  'README.md': 'h-readme',
}
