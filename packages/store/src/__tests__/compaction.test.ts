import type { ContinuumEvent } from '@continuum/core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'

const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
import { ContextStore } from '../contextStore'
import { ev } from './fixtures'

/** Fixture events are stamped a minute apart starting 2026-10-16T10:00Z; this moves one to a given day. */
const on = (day: number, event: ContinuumEvent): ContinuumEvent => ({ ...event, occurredAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z` })

function history(store: ContextStore) {
  store.record(on(1, ev.file('src/a.ts', 'h-a1')))
  store.record(on(1, ev.task('auth')))
  store.record(on(2, ev.sessionStart('s1', 'auth')))
  store.record(on(2, ev.file('src/a.ts', 'h-a2', { sessionId: 's1', taskId: 'auth' })))
  store.transact(() => [on(3, ev.checkCovered('npm test', store.putCoverage({ 'file:src/a.ts': 'h-a2' })))])
  store.record(on(3, ev.memory('decision', { 'file:src/a.ts': 'h-a2' }, 'auth')))
  store.record(on(4, ev.sessionEnd('s1', 'Wired the callback')))
  store.record(on(20, ev.file('src/a.ts', 'h-a3')))
  store.record(on(21, ev.sessionStart('s2', 'auth')))
}

describe('ContextStore.compact', () => {
  it('removes old events while leaving the graph, check status and memory status unchanged', () => {
    const store = ContextStore.open(':memory:')
    history(store)
    const before = store.snapshot()
    const status = [store.checkStatus('npm test'), store.memoryStatus('decision')]

    const result = store.compact(new Date('2026-10-10T00:00:00Z'))
    expect(result.removedEvents).toBe(7)
    expect(store.eventCount()).toBe(2)
    expect(store.snapshot()).toEqual(before)
    expect([store.checkStatus('npm test'), store.memoryStatus('decision')]).toEqual(status)
    store.close()
  })

  it('replays the checkpoint plus the remaining log into exactly the same graph', () => {
    const store = ContextStore.open(':memory:')
    history(store)
    store.compact(new Date('2026-10-10T00:00:00Z'))
    store.record(on(22, ev.file('src/b.ts', 'h-b1', { sessionId: 's2', taskId: 'auth' })))
    const before = store.snapshot()
    store.rebuild()
    expect(store.snapshot()).toEqual(before)
    expect(store.checkRun('npm test')?.ranAgainst).toEqual({ 'file:src/a.ts': 'h-a2' })
    store.close()
  })

  it('compacts again on top of an earlier checkpoint', () => {
    const store = ContextStore.open(':memory:')
    history(store)
    store.compact(new Date('2026-10-03T00:00:00Z'))
    const before = store.snapshot()
    expect(store.compact(new Date('2026-10-30T00:00:00Z')).removedEvents).toBe(5)
    expect(store.eventCount()).toBe(0)
    store.rebuild()
    expect(store.snapshot()).toEqual(before)
    store.close()
  })

  it('still finds the first event of each source and type after it was compacted away', () => {
    const store = ContextStore.open(':memory:')
    history(store)
    const first = store.firstEvent({ type: 'file.changed' })
    const firstSession = store.firstEvent({ type: 'session.started' })
    store.compact(new Date('2026-10-10T00:00:00Z'))
    expect(store.firstEvent({ type: 'file.changed' })).toEqual(first)
    expect(store.firstEvent({ type: 'session.started' })).toEqual(firstSession)
    expect(store.firstEvent({ source: 'nowhere' })).toBeUndefined()
    store.close()
  })

  it('keeps checks recorded by an earlier version readable after they are folded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'continuum-compact-'))
    const path = join(dir, 'context.db')
    const store = ContextStore.open(path)
    store.record(on(1, ev.file('src/a.ts', 'h-a1')))
    store.record(on(2, ev.check('legacy', 0, { 'file:src/a.ts': 'h-a1' })))
    store.record(on(20, ev.sessionStart('s1')))
    // An earlier version stored the run record in another shape: the replay's record is not in this store.
    const raw = new DatabaseSync(path)
    raw.exec("DELETE FROM objects WHERE kind = 'check-run'")
    raw.close()
    store.compact(new Date('2026-10-10T00:00:00Z'))
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    expect(store.checkRun('legacy')?.ranAgainst).toEqual({ 'file:src/a.ts': 'h-a1' })
    expect(store.checkStatus('legacy').status).toBe('passed')
    store.close()
  })

  it('never removes an event inside the window, even when an older-dated one follows it', () => {
    const store = ContextStore.open(':memory:')
    store.record(on(1, ev.file('src/a.ts', 'h-a1')))
    store.record(on(20, ev.sessionStart('recent')))
    store.record(on(2, ev.file('src/a.ts', 'h-a2')))
    expect(store.compact(new Date('2026-10-10T00:00:00Z')).removedEvents).toBe(1)
    expect(store.eventCount()).toBe(2)
    store.close()
  })

  it('does nothing when no event is older than the cutoff', () => {
    const store = ContextStore.open(':memory:')
    history(store)
    expect(store.compact(new Date('2026-09-01T00:00:00Z'))).toEqual({ removedEvents: 0, checkpointSeq: null })
    expect(store.eventCount()).toBe(9)
    expect(store.checkpoint()).toBeUndefined()
    store.close()
  })
})

describe('ContextStore export and import', () => {
  it('reproduces the same graph and statuses in another store, including a checkpoint', () => {
    const source = ContextStore.open(':memory:')
    history(source)
    source.compact(new Date('2026-10-03T00:00:00Z'))
    const exported = JSON.parse(JSON.stringify(source.exportHistory()))
    const target = ContextStore.open(':memory:')
    target.importHistory(exported)
    expect(target.snapshot()).toEqual(source.snapshot())
    expect(target.checkStatus('npm test')).toEqual(source.checkStatus('npm test'))
    expect(target.checkRun('npm test')).toEqual(source.checkRun('npm test'))
    expect(target.firstEvent({ type: 'file.changed' })).toEqual(source.firstEvent({ type: 'file.changed' }))
    target.rebuild()
    expect(target.snapshot()).toEqual(source.snapshot())
    source.close()
    target.close()
  })

  it('refuses to import over existing history or an unknown format', () => {
    const source = ContextStore.open(':memory:')
    history(source)
    const exported = source.exportHistory()
    expect(() => source.importHistory(exported)).toThrow(/already has history/)
    expect(() => ContextStore.open(':memory:').importHistory({ ...exported, format: 'other' } as never)).toThrow(/not a valid Continuum history export: unknown format/)
    const outOfOrder = { ...exported, events: [...exported.events].reverse() }
    expect(() => ContextStore.open(':memory:').importHistory(outOfOrder)).toThrow(/sequence numbers must increase/)
    const malformed = { ...exported, events: [{ seq: 1, event: { type: 'file.changed', payload: 'not an object' } }] }
    expect(() => ContextStore.open(':memory:').importHistory(malformed as never)).toThrow(/malformed events/)
    source.close()
  })
})
