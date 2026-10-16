import { ContextStore } from '@continuum/store'
import { describe, expect, it } from 'vitest'
import { projectState } from '../projectState'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

describe('projectState', () => {
  it('orders sessions by latest activity and attributes the files they changed', () => {
    const state = projectState(seededStore(), tree(CURRENT_FILES), NOW)
    expect(state.sessions.map((session) => session.id)).toEqual(['latest', 'old'])
    expect(state.sessions[0]).toMatchObject({
      agent: 'claude-code',
      ended: false,
      note: 'Callback route wired. Next: validate the state parameter.',
      filesChanged: [
        { path: 'src/auth/callback.ts', exists: true },
        { path: 'src/auth/login.ts', exists: true },
      ],
    })
    expect(state.sessions[1]).toMatchObject({ ended: true, note: 'Session service done' })
  })

  it('evaluates checks against live hashes', () => {
    const live = { ...CURRENT_FILES, 'src/auth/login.ts': 'h-login-2' }
    const state = projectState(seededStore(), tree(live), NOW)
    expect(state.checks).toEqual([
      expect.objectContaining({ name: 'e2e', status: 'out-of-date', changed: ['src/auth/callback.ts'], exitCode: 1 }),
      expect.objectContaining({ name: 'unit', status: 'out-of-date', changed: ['src/auth/login.ts'], command: 'npm test' }),
    ])
  })

  it('reports decisions whose anchored code changed', () => {
    const fresh = projectState(seededStore(), tree(CURRENT_FILES), NOW)
    expect(fresh.decisions).toEqual([expect.objectContaining({ id: 'reuse-session', kind: 'decision', status: 'current', evidence: 'agent-reported' })])
    const { 'src/auth/session.ts': _removed, ...withoutSession } = CURRENT_FILES
    const stale = projectState(seededStore(), tree(withoutSession), NOW)
    expect(stale.decisions[0]).toMatchObject({ status: 'anchor-changed', changed: ['src/auth/session.ts'] })
    expect(stale.sessions[1].filesChanged).toEqual([{ path: 'src/auth/session.ts', exists: false }])
  })

  it('lists changes not yet recorded', () => {
    const state = projectState(seededStore(), tree({ ...CURRENT_FILES, 'src/new.ts': 'h-new' }), NOW)
    expect(state.files).toEqual({ tracked: 5, unrecorded: [{ path: 'src/new.ts', changeType: 'added', contentHash: 'h-new' }] })
  })

  it('works on an empty store', () => {
    const state = projectState(ContextStore.open(':memory:'), tree({}, null), NOW)
    expect(state).toMatchObject({ revision: null, sessions: [], checks: [], decisions: [], files: { tracked: 0, unrecorded: [] } })
  })
})
