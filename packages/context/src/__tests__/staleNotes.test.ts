import type { ContinuumEvent } from '@continuum/core'
import { describe, expect, it } from 'vitest'
import { renderHandoff } from '../handoff'
import { projectState } from '../projectState'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const event = (type: ContinuumEvent['type'], payload: Record<string, unknown>, minutes: number): ContinuumEvent =>
  ({ type, payload, evidence: type === 'session.progress' ? 'agent-reported' : 'observed', source: 'test', occurredAt: minutesAgo(minutes) }) as ContinuumEvent

/** The seeded repository: the latest Claude Code session changed login.ts and callback.ts, then left a note naming its next step. */
function latestSession(files: Record<string, string> = CURRENT_FILES, extra: ContinuumEvent[] = []) {
  const store = seededStore()
  store.recordAll(extra)
  const state = projectState(store, tree(files), NOW)
  return { state, session: state.sessions.find((candidate) => candidate.id === 'latest') }
}

const sectionOf = (text: string, heading: string) => {
  const start = text.indexOf(`## ${heading}`)
  if (start === -1) return ''
  const next = text.indexOf('\n## ', start + 1)
  return text.slice(start, next === -1 ? undefined : next)
}

describe('files a session changed that changed again since', () => {
  it('lists none while the code is as the session left it', () => {
    expect(latestSession().session?.changedSince).toEqual([])
  })

  it('counts an edit by hand that nothing has recorded yet', () => {
    expect(latestSession({ ...CURRENT_FILES, 'src/auth/login.ts': 'h-login-2' }).session?.changedSince).toEqual([{ path: 'src/auth/login.ts', by: { kind: 'outside' } }])
  })

  it('counts a recorded change made outside any agent session, such as a commit by hand', () => {
    const { session } = latestSession({ ...CURRENT_FILES, 'src/auth/login.ts': 'h-login-2' }, [event('file.changed', { path: 'src/auth/login.ts', contentHash: 'h-login-2', changeType: 'modified' }, 10)])
    expect(session?.changedSince).toEqual([{ path: 'src/auth/login.ts', by: { kind: 'outside' } }])
  })

  it('names the agent when another session changed it', () => {
    const { session } = latestSession({ ...CURRENT_FILES, 'src/auth/callback.ts': 'h-callback-2' }, [
      event('session.started', { sessionId: 'codex-1', agent: 'codex' }, 15),
      event('file.changed', { path: 'src/auth/callback.ts', contentHash: 'h-callback-2', changeType: 'modified', sessionId: 'codex-1' }, 12),
    ])
    expect(session?.changedSince).toEqual([{ path: 'src/auth/callback.ts', by: { kind: 'session', agent: 'codex' } }])
  })

  it('counts a file that is gone', () => {
    const { 'src/auth/callback.ts': _gone, ...rest } = CURRENT_FILES
    expect(latestSession(rest).session?.changedSince).toEqual([{ path: 'src/auth/callback.ts', by: { kind: 'deleted' } }])
  })

  it('does not count the session changing a file again itself', () => {
    const { session } = latestSession({ ...CURRENT_FILES, 'src/auth/login.ts': 'h-login-3' }, [event('file.changed', { path: 'src/auth/login.ts', contentHash: 'h-login-3', changeType: 'modified', sessionId: 'latest' }, 5)])
    expect(session?.changedSince).toEqual([])
  })
})

describe('the briefing on a note the code moved on from', () => {
  const handHedited = { ...CURRENT_FILES, 'src/auth/login.ts': 'h-login-2' }

  it('warns under the note, naming each file and who changed it', () => {
    const left = sectionOf(renderHandoff(latestSession(handHedited).state, { now: NOW }), 'Where we left off')
    expect(left).toContain('Last note [agent-reported]: "Callback route wired. Next: validate the state parameter."')
    expect(left).toContain('[observed] Since then, files this session changed were changed again: `src/auth/login.ts` (outside an agent session). Check the note against the code before relying on it.')
  })

  it('warns on the next step a stale note named', () => {
    const next = sectionOf(renderHandoff(latestSession(handHedited).state, { now: NOW }), 'Next step')
    expect(next).toContain('"validate the state parameter."')
    expect(next).toContain('[observed] `src/auth/login.ts` changed since that note.')
  })

  it('says which agent changed a file, and marks earlier sessions too', () => {
    const { state } = latestSession(CURRENT_FILES, [
      event('session.started', { sessionId: 'codex-1', agent: 'codex' }, 15),
      event('file.changed', { path: 'src/auth/session.ts', contentHash: 'h-session-2', changeType: 'modified', sessionId: 'codex-1' }, 12),
      event('session.progress', { sessionId: 'codex-1', note: 'Looked around.' }, 11),
    ])
    const earlier = sectionOf(renderHandoff(projectState(seededStore(), tree({ ...CURRENT_FILES, 'src/auth/session.ts': 'h-session-2' }), NOW), { now: NOW }), 'Earlier sessions')
    expect(earlier).toContain('(since then `src/auth/session.ts` changed outside an agent session)')
    expect(state.sessions.find((session) => session.id === 'old')?.changedSince).toEqual([{ path: 'src/auth/session.ts', by: { kind: 'session', agent: 'codex' } }])
  })

  it('adds nothing while the code is as the session left it', () => {
    const text = renderHandoff(latestSession().state, { now: NOW })
    expect(text).not.toContain('changed again')
    expect(text).not.toContain('changed since that note')
  })
})
