import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ContinuumEvent } from '@continuum/core'
import { afterEach, describe, expect, it } from 'vitest'
import { ContextStore } from '../contextStore'
import { forgetPath, forgetSession, forgetTextBefore, InvalidForgetPathError } from '../forget'
import { ev } from './fixtures'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fileStore() {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-forget-'))
  dirs.push(dir)
  const path = join(dir, 'context.db')
  return { path, store: ContextStore.open(path) }
}

/** Everything on disk for this store, as bytes: the database, its WAL and shared memory. */
function rawBytes(path: string): string {
  return ['', '-wal', '-shm'].map((suffix) => (existsSync(path + suffix) ? readFileSync(path + suffix).toString('latin1') : '')).join('')
}

const on = (day: number, event: ContinuumEvent): ContinuumEvent => ({ ...event, occurredAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z` })
const SECRET = 'src/secret-plans.ts'

function history(store: ContextStore) {
  store.record(on(1, ev.file(SECRET, 'h-secret-1')))
  store.record(on(1, ev.file('src/app.ts', 'h-app-1')))
  store.record(on(2, ev.sessionStart('s1')))
  store.record(on(2, ev.file(SECRET, 'h-secret-2', { sessionId: 's1' })))
  store.record(on(2, ev.sessionProgress('s1', `Moved the pricing logic into ${SECRET} as planned`)))
  store.transact(() => [on(3, ev.checkCovered('npm test', store.putCoverage({ [`file:${SECRET}`]: 'h-secret-2', 'file:src/app.ts': 'h-app-1' })))])
  store.record(on(3, ev.memory('pricing', { [`file:${SECRET}`]: 'h-secret-2', 'file:src/app.ts': 'h-app-1' })))
  store.record(on(4, { ...ev.sessionEnd('s1', 'done'), type: 'commit.recorded', payload: { hash: 'c0ffee', message: `Add ${SECRET}`, files: [SECRET, 'src/app.ts'] } } as ContinuumEvent))
}

describe('forgetPath', () => {
  it('removes every trace of a file, down to the bytes of the database file', () => {
    const { path, store } = fileStore()
    history(store)
    expect(rawBytes(path)).toContain(SECRET)

    const result = store.rewriteHistory(forgetPath(SECRET))
    expect(result.removedEvents).toBe(2)
    expect(store.vacuum()).toEqual({ shrunk: true, walCleared: true })
    store.close()
    expect(rawBytes(path)).not.toContain(SECRET)

    const reopened = ContextStore.open(path)
    expect(reopened.graph.has(`file:${SECRET}`)).toBe(false)
    expect(reopened.checkRun('npm test')?.ranAgainst).toEqual({ 'file:src/app.ts': 'h-app-1' })
    expect(reopened.checkStatus('npm test').status).toBe('passed')
    expect(reopened.graph.get('memory:pricing')?.props.anchors).toEqual({ 'file:src/app.ts': 'h-app-1' })
    expect(reopened.graph.get('session:s1')?.props.lastNote).toBe('Moved the pricing logic into [forgotten] as planned')
    reopened.close()
  })

  it('also reaches history already folded into a compaction checkpoint', () => {
    const { path, store } = fileStore()
    history(store)
    store.compact(new Date('2026-10-03T12:00:00Z'))
    store.rewriteHistory(forgetPath('src/'))
    store.vacuum()
    const after = store.snapshot()
    store.rebuild()
    expect(store.snapshot()).toEqual(after)
    store.close()
    expect(rawBytes(path)).not.toContain(SECRET)
  })

  it('leaves a store with nothing to forget unchanged', () => {
    const { store } = fileStore()
    history(store)
    const before = store.snapshot()
    expect(store.rewriteHistory(forgetPath('docs/never.md'))).toEqual({ removedEvents: 0, changedEvents: 0, changedCheckpoint: false })
    expect(store.snapshot()).toEqual(before)
    store.close()
  })
})

describe('forgetSession', () => {
  it("removes a session and what it said, keeping its file changes unattributed", () => {
    const { path, store } = fileStore()
    history(store)
    store.rewriteHistory(forgetSession('s1'))
    store.vacuum()
    expect(store.graph.has('session:s1')).toBe(false)
    expect(store.graph.get(`file:${SECRET}`)?.hash).toBe('h-secret-2')
    expect(store.graph.get(`file:${SECRET}`)?.props.changedBy).toBeNull()
    store.close()
    expect(rawBytes(path)).not.toContain('Moved the pricing logic')
  })
})

describe('forgetTextBefore', () => {
  it('removes prompts and notes from before a date and keeps later ones', () => {
    const { path, store } = fileStore()
    store.record(on(1, { ...ev.sessionProgress('s1', 'x'), type: 'session.prompted', payload: { sessionId: 's1', prompt: 'old private request' } } as ContinuumEvent))
    store.record(on(9, { ...ev.sessionProgress('s2', 'x'), type: 'session.prompted', payload: { sessionId: 's2', prompt: 'recent request' } } as ContinuumEvent))
    store.rewriteHistory(forgetTextBefore(new Date('2026-10-05T00:00:00Z')))
    store.vacuum()
    expect(store.graph.get('session:s2')?.props.lastPrompt).toBe('recent request')
    store.close()
    expect(rawBytes(path)).not.toContain('old private request')
  })
})

describe('forget, hardened', () => {
  it.each(['/', './', '.', '..', 'a', '/etc/passwd', 'src/../secrets'])('refuses to forget %s', (path) => {
    expect(() => forgetPath(path)).toThrow(InvalidForgetPathError)
  })

  it('matches paths without regard to case, as macOS does', () => {
    const { path, store } = fileStore()
    history(store)
    store.rewriteHistory(forgetPath('SRC/Secret-Plans.ts'))
    store.vacuum()
    store.close()
    expect(rawBytes(path).toLowerCase()).not.toContain(SECRET)
  })

  it('scrubs the forgotten path from check names folded into a checkpoint', () => {
    const { path, store } = fileStore()
    store.record(on(1, ev.file(SECRET, 'h-1')))
    store.transact(() => [on(1, ev.checkCovered(`cat ${SECRET}`, store.putCoverage({ [`file:${SECRET}`]: 'h-1' })))])
    store.record(on(9, ev.sessionStart('later')))
    store.compact(new Date('2026-10-05T00:00:00Z'))
    store.rewriteHistory(forgetPath(SECRET))
    store.vacuum()
    expect(store.graph.has('check:cat [forgotten]')).toBe(true)
    store.close()
    expect(rawBytes(path)).not.toContain(SECRET)
  })

  it('removes old check output that was folded into a checkpoint', () => {
    const { path, store } = fileStore()
    store.transact(() => [on(1, { ...ev.checkCovered('npm test', store.putCoverage({})), payload: { name: 'npm test', command: 'npm test', exitCode: 1, durationMs: 1, coverage: store.putCoverage({}), outputTail: 'stack trace with a private hostname' } } as ContinuumEvent)])
    store.record(on(9, ev.sessionStart('later')))
    store.compact(new Date('2026-10-05T00:00:00Z'))
    const result = store.rewriteHistory(forgetTextBefore(new Date('2026-10-05T00:00:00Z')))
    expect(result.changedCheckpoint).toBe(true)
    store.vacuum()
    store.close()
    expect(rawBytes(path)).not.toContain('private hostname')
  })
})

describe('forgetPath and symbols', () => {
  it('also removes decisions anchored to symbols inside the forgotten file', () => {
    const { path, store } = fileStore()
    store.record(on(1, ev.file(SECRET, 'h-1')))
    store.record(on(2, ev.memory('plan', { [`symbol:${SECRET}#pricing`]: 'h-sym', 'file:src/app.ts': 'h-app' })))
    store.rewriteHistory(forgetPath(SECRET))
    store.vacuum()
    expect(store.graph.get('memory:plan')?.props.anchors).toEqual({ 'file:src/app.ts': 'h-app' })
    expect(store.graph.has(`symbol:${SECRET}#pricing`)).toBe(false)
    store.close()
    expect(rawBytes(path)).not.toContain(SECRET)
  })
})
