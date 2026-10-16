import { describe, expect, it } from 'vitest'
import { anchorStatus, checkStatus } from '../evidenceRules'

const current = new Map([
  ['file:src/auth/login.ts', 'h-login-2'],
  ['file:src/auth/session.ts', 'h-session-1'],
])

describe('checkStatus', () => {
  it('is passed when the run succeeded and every covered file is unchanged', () => {
    const run = { exitCode: 0, ranAgainst: { 'file:src/auth/session.ts': 'h-session-1' } }
    expect(checkStatus(run, current)).toEqual({ status: 'passed', changed: [] })
  })

  it('is failed when the run failed and nothing changed since', () => {
    const run = { exitCode: 1, ranAgainst: { 'file:src/auth/session.ts': 'h-session-1' } }
    expect(checkStatus(run, current).status).toBe('failed')
  })

  it('is out of date when any covered file has a different hash now', () => {
    const run = { exitCode: 0, ranAgainst: { 'file:src/auth/login.ts': 'h-login-1', 'file:src/auth/session.ts': 'h-session-1' } }
    expect(checkStatus(run, current)).toEqual({ status: 'out-of-date', changed: ['file:src/auth/login.ts'] })
  })

  it('treats a covered file that no longer exists as changed', () => {
    const run = { exitCode: 0, ranAgainst: { 'file:src/removed.ts': 'h-old' } }
    expect(checkStatus(run, current)).toEqual({ status: 'out-of-date', changed: ['file:src/removed.ts'] })
  })

  it('is unknown when the run recorded no coverage at all', () => {
    expect(checkStatus({ exitCode: 0, ranAgainst: {} }, current).status).toBe('unknown')
  })

  it('is not-run when there is no recorded run', () => {
    expect(checkStatus(undefined, current).status).toBe('not-run')
  })
})

describe('anchorStatus', () => {
  it('is current when every anchor still has the recorded hash', () => {
    expect(anchorStatus({ 'file:src/auth/session.ts': 'h-session-1' }, current)).toEqual({ status: 'current', changed: [] })
  })

  it('flags the anchors whose hash changed', () => {
    expect(anchorStatus({ 'file:src/auth/login.ts': 'h-login-1' }, current)).toEqual({ status: 'anchor-changed', changed: ['file:src/auth/login.ts'] })
  })

  it('is unanchored when a record has no anchors', () => {
    expect(anchorStatus({}, current).status).toBe('unanchored')
  })
})
