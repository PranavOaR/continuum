import { describe, expect, it } from 'vitest'
import { closingWarning, unverifiedChecks } from '../closing'
import { projectState } from '../projectState'
import { CURRENT_FILES, NOW, seededStore, tree } from './fixtures'

/** The seeded repository with a task that touched one file: `unit` passed on login and session, `e2e` failed on the callback. */
function withTask(path: string | null) {
  const store = seededStore()
  store.record({ type: 'task.upserted', payload: { id: 't', title: 'Callback', status: 'in-progress' }, evidence: 'agent-reported', source: 'mcp', occurredAt: NOW.toISOString() })
  if (path) store.record({ type: 'file.changed', payload: { path, contentHash: CURRENT_FILES[path as keyof typeof CURRENT_FILES], changeType: 'modified', sessionId: 'latest', taskId: 't' }, evidence: 'observed', source: 'test', occurredAt: NOW.toISOString() })
  return store
}

const names = (store: ReturnType<typeof withTask>, files: Record<string, string> = CURRENT_FILES) =>
  unverifiedChecks(store, projectState(store, tree(files), NOW), 't').map(({ check }) => check.name)

describe('unverifiedChecks', () => {
  it('names a check that failed on a file the task touched, which has changed again since', () => {
    expect(names(withTask('src/auth/callback.ts'))).toEqual(['e2e'])
  })

  it('names a passed check once a file it covered has changed, and nothing while it still holds', () => {
    const store = withTask('src/auth/login.ts')
    expect(names(store)).toEqual([])
    expect(names(store, { ...CURRENT_FILES, 'src/auth/login.ts': 'h-login-2' })).toEqual(['unit'])
  })

  it('leaves out checks that never covered the task files', () => {
    expect(names(withTask('README.md'))).toEqual([])
  })

  it('lists every failed or out-of-date check for a task with no recorded files', () => {
    const [first] = unverifiedChecks(withTask(null), projectState(withTask(null), tree(CURRENT_FILES), NOW), 't')
    expect(first).toMatchObject({ check: { name: 'e2e' }, coversTaskFiles: false })
  })
})

describe('closingWarning', () => {
  it('names each check with its evidence label and why it does not hold, and says the task stays closed', () => {
    const store = withTask('src/auth/login.ts')
    store.record({ type: 'file.changed', payload: { path: 'src/auth/callback.ts', contentHash: 'h-callback-1', changeType: 'modified', sessionId: 'latest', taskId: 't' }, evidence: 'observed', source: 'test', occurredAt: NOW.toISOString() })
    store.record({ type: 'check.recorded', payload: { name: 'lint', command: 'npm run lint', exitCode: 2, durationMs: 300, ranAgainst: { 'file:src/auth/callback.ts': 'h-callback-1' } }, evidence: 'observed', source: 'adapter:claude-code', occurredAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() })
    const state = projectState(store, tree({ ...CURRENT_FILES, 'src/auth/login.ts': 'h-login-2' }), NOW)
    const warning = closingWarning(unverifiedChecks(store, state, 't'), NOW)
    expect(warning).toContain('Warning: closed with unverified work.')
    expect(warning).toContain('[observed: run by an agent] `lint` FAILED (exit 2), ran 5m ago')
    expect(warning).toContain('[verified] `e2e` is OUT OF DATE: src/auth/callback.ts changed since it ran 55m ago')
    expect(warning).toContain('[verified] `unit` is OUT OF DATE: src/auth/login.ts changed since it ran 40m ago')
    expect(warning).toContain('The task is still completed.')
    expect(warning).toContain('continuum run --name e2e -- npm run e2e')
  })

  it('is silent when every related check holds', () => {
    expect(closingWarning([], NOW)).toBeNull()
  })
})
