import { describe, expect, it } from 'vitest'
import { projectState } from '../projectState'
import { explain, renderWhy } from '../why'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

function store() {
  const seeded = seededStore()
  seeded.recordAll([
    { type: 'task.upserted', payload: { id: 'callback', title: 'Google callback', status: 'in-progress', objective: 'Sign in with Google' }, evidence: 'agent-reported', source: 'mcp', occurredAt: NOW.toISOString() },
    { type: 'file.changed', payload: { path: 'src/auth/session.ts', contentHash: 'h-session-1', changeType: 'modified', sessionId: 'latest', taskId: 'callback' }, evidence: 'observed', source: 'test', occurredAt: NOW.toISOString() },
    { type: 'memory.recorded', payload: { id: 'sym', kind: 'known-issue', title: 'createSession ignores expiry', body: '', anchors: { 'symbol:src/auth/session.ts#createSession': 'h-sym-1' } }, evidence: 'user-reported', source: 'dashboard', occurredAt: NOW.toISOString() },
  ])
  return seeded
}

const report = (target: Parameters<typeof explain>[2], files: Record<string, string> = CURRENT_FILES) => {
  const seeded = store()
  return explain(seeded, projectState(seeded, tree(files), NOW), target)
}

describe('explain', () => {
  it('lists every record anchored to a file, the tasks and sessions that changed it and the checks that covered it', () => {
    const why = report({ path: 'src/auth/session.ts' })
    expect(why.known).toBe(true)
    expect(why.decisions.map(({ decision, anchor }) => [decision.id, anchor]).sort()).toEqual([['reuse-session', 'the whole file'], ['sym', 'src/auth/session.ts#createSession']])
    expect(why.tasks.map((task) => task.id)).toEqual(['callback'])
    expect(why.checks.map((check) => check.name)).toEqual(['unit'])
    expect(why.sessions.map((session) => session.id).sort()).toEqual(['latest', 'old'])
  })

  it('for a symbol, lists what is anchored to it and to its whole file, not to other symbols', () => {
    expect(report({ path: 'src/auth/session.ts', symbol: 'createSession' }).decisions.map(({ decision }) => decision.id).sort()).toEqual(['reuse-session', 'sym'])
    expect(report({ path: 'src/auth/session.ts', symbol: 'destroySession' }).decisions.map(({ decision }) => decision.id)).toEqual(['reuse-session'])
  })
})

describe('renderWhy', () => {
  it('prints each record with its evidence label', () => {
    const text = renderWhy(report({ path: 'src/auth/session.ts' }), NOW)
    expect(text).toContain('What is recorded about src/auth/session.ts: 2 decisions, 1 task, 1 check, 2 sessions.')
    expect(text).toContain('- [agent-reported] decision: Callbacks reuse createSession (Do not mint tokens in the callback.) (anchored to the whole file')
    expect(text).toContain('- [set by you] known-issue: createSession ignores expiry (anchored to src/auth/session.ts#createSession')
    expect(text).toContain('- [agent-reported] task "Google callback" (in-progress): Sign in with Google')
    expect(text).toContain('- [verified] unit (`npm test`): PASSED')
    expect(text).toContain('- [observed] Claude Code session edited it')
  })

  it('says when the file changed since a check ran or a decision was anchored', () => {
    const text = renderWhy(report({ path: 'src/auth/session.ts' }, { ...CURRENT_FILES, 'src/auth/session.ts': 'h-session-2' }), NOW)
    expect(text).toContain('unit (`npm test`): OUT OF DATE (this file changed since it ran)')
    expect(text).toContain('anchored code changed since: src/auth/session.ts')
  })

  it('says so plainly when nothing is linked, or the file is unknown', () => {
    expect(renderWhy(report({ path: 'README.md' }), NOW)).toContain('Nothing recorded is linked to README.md yet')
    expect(renderWhy(report({ path: 'src/nope.ts' }), NOW)).toContain('Continuum has no record of src/nope.ts')
  })
})
