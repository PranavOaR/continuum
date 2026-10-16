import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ContextStore } from '../contextStore'
import { ev } from './fixtures'

const dirs: string[] = []
function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-store-'))
  dirs.push(dir)
  return join(dir, 'context.db')
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function seed(store: ContextStore) {
  store.record(ev.task('auth'))
  store.record(ev.sessionStart('s1', 'auth'))
  store.record(ev.file('src/auth/login.ts', 'h-login-1', { sessionId: 's1', taskId: 'auth' }))
  store.record(ev.file('src/auth/session.ts', 'h-session-1', { sessionId: 's1', taskId: 'auth' }))
  store.record(ev.check('npm test', 0, { 'file:src/auth/login.ts': 'h-login-1', 'file:src/auth/session.ts': 'h-session-1' }))
  store.record(ev.memory('session-service', { 'file:src/auth/session.ts': 'h-session-1' }, 'auth'))
  store.record(ev.sessionEnd('s1', 'Callback validation still TODO'))
}

describe('ContextStore objects', () => {
  it('stores content-addressed objects idempotently', () => {
    const store = ContextStore.open(':memory:')
    const first = store.putObject('note', { text: 'hi', n: 1 })
    const second = store.putObject('note', { n: 1, text: 'hi' })
    expect(second).toBe(first)
    expect(store.getObject(first)).toEqual({ kind: 'note', value: { text: 'hi', n: 1 } })
    expect(store.getObject('missing')).toBeUndefined()
    store.close()
  })
})

describe('ContextStore projection', () => {
  it('projects events into nodes and typed edges', () => {
    const store = ContextStore.open(':memory:')
    seed(store)
    const { graph } = store
    expect(graph.get('task:auth')?.props).toMatchObject({ title: 'Implement Google authentication', status: 'in-progress' })
    expect(graph.neighbors('task:auth', { direction: 'out', types: ['touches'] })).toEqual(['file:src/auth/login.ts', 'file:src/auth/session.ts'])
    expect(graph.neighbors('session:s1', { direction: 'out', types: ['worked_on'] })).toEqual(['task:auth'])
    expect(graph.neighbors('session:s1', { direction: 'out', types: ['modified'] })).toHaveLength(2)
    expect(graph.neighbors('check:npm test', { direction: 'out', types: ['ran_against'] })).toHaveLength(2)
    expect(graph.neighbors('memory:session-service', { direction: 'out' })).toEqual(['file:src/auth/session.ts', 'task:auth'])
    expect(graph.get('session:s1')?.props).toMatchObject({ agent: 'claude-code', summary: 'Callback validation still TODO' })
    expect(store.eventCount()).toBe(7)
    store.close()
  })

  it('keeps the latest progress note on the session without touching when it started', () => {
    const store = ContextStore.open(':memory:')
    store.record(ev.sessionStart('s1'))
    const startedAt = store.graph.get('session:s1')?.props.startedAt
    store.record(ev.sessionProgress('s1', 'Wired the callback route; tests next'))
    store.record(ev.sessionProgress('s1', 'Tests written; two failing'))
    expect(store.graph.get('session:s1')?.props).toMatchObject({ startedAt, lastNote: 'Tests written; two failing' })
    expect(store.graph.get('session:s1')?.props.lastActivityAt).toEqual(expect.any(String))
    store.close()
  })

  it('creates the session when progress arrives first', () => {
    const store = ContextStore.open(':memory:')
    store.record(ev.sessionProgress('late', 'note'))
    expect(store.graph.get('session:late')?.props.lastNote).toBe('note')
    store.close()
  })

  it('reports a passing check as out of date once a covered file changes', () => {
    const store = ContextStore.open(':memory:')
    seed(store)
    expect(store.checkStatus('npm test')).toEqual({ status: 'passed', changed: [] })
    store.record(ev.file('src/auth/login.ts', 'h-login-2'))
    expect(store.checkStatus('npm test')).toEqual({ status: 'out-of-date', changed: ['file:src/auth/login.ts'] })
    expect(store.graph.get('file:src/auth/login.ts')?.history).toEqual(['h-login-1', 'h-login-2'])
    expect(store.checkStatus('never ran').status).toBe('not-run')
    store.close()
  })

  it('flags memory whose anchored code changed, including deletion', () => {
    const store = ContextStore.open(':memory:')
    seed(store)
    expect(store.memoryStatus('session-service').status).toBe('current')
    store.record(ev.file('src/auth/session.ts', null))
    expect(store.memoryStatus('session-service')).toEqual({ status: 'anchor-changed', changed: ['file:src/auth/session.ts'] })
    store.close()
  })

  it('records nothing when an event cannot be projected', () => {
    const store = ContextStore.open(':memory:')
    const bad = { ...ev.task('x'), type: 'nonsense.event' } as unknown as Parameters<ContextStore['record']>[0]
    expect(() => store.record(bad)).toThrow(/Unsupported event type/)
    expect(store.eventCount()).toBe(0)
    expect(store.graph.size).toBe(0)
    store.close()
  })

  it('records a batch of events in one transaction', () => {
    const store = ContextStore.open(':memory:')
    store.recordAll([ev.file('a.ts', 'h-a'), ev.file('b.ts', 'h-b')])
    expect(store.eventCount()).toBe(2)
    expect(store.graph.currentHashes()).toEqual(new Map([['file:a.ts', 'h-a'], ['file:b.ts', 'h-b']]))
    store.close()
  })

  it('records none of a batch when any event in it fails', () => {
    const store = ContextStore.open(':memory:')
    const bad = { ...ev.task('x'), type: 'nonsense.event' } as unknown as Parameters<ContextStore['record']>[0]
    expect(() => store.recordAll([ev.file('a.ts', 'h-a'), bad])).toThrow(/Unsupported event type/)
    expect(store.eventCount()).toBe(0)
    expect(store.graph.size).toBe(0)
    store.close()
  })
})

describe('ContextStore persistence', () => {
  it('rebuilds an identical graph when reopened from disk', () => {
    const path = tempDb()
    const first = ContextStore.open(path)
    seed(first)
    first.record(ev.file('src/auth/login.ts', 'h-login-2'))
    const before = first.snapshot()
    first.close()

    const reopened = ContextStore.open(path)
    expect(reopened.snapshot()).toEqual(before)
    expect(reopened.checkStatus('npm test').status).toBe('out-of-date')
    reopened.close()
  })

  it('sees events written by another connection before building a transaction', () => {
    const path = tempDb()
    const watcher = ContextStore.open(path)
    const other = ContextStore.open(path)
    watcher.record(ev.file('a.ts', 'h1'))
    other.record(ev.file('a.ts', 'h2'))
    expect(watcher.graph.get('file:a.ts')?.hash).toBe('h1')
    const seen = watcher.transact(() => {
      expect(watcher.graph.get('file:a.ts')?.hash).toBe('h2')
      return []
    })
    expect(seen).toEqual([])
    expect(watcher.refresh()).toBe(false)
    other.close()
    watcher.close()
  })

  it('reports whether a refresh reloaded anything', () => {
    const path = tempDb()
    const first = ContextStore.open(path)
    const second = ContextStore.open(path)
    expect(first.refresh()).toBe(false)
    second.record(ev.task('t'))
    expect(first.refresh()).toBe(true)
    expect(first.graph.has('task:t')).toBe(true)
    first.record(ev.task('u'))
    expect(first.refresh()).toBe(false)
    second.close()
    first.close()
  })

  it('creates the database readable only by its owner', () => {
    const path = tempDb()
    ContextStore.open(path).close()
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('lists the newest events first with their sequence numbers', () => {
    const store = ContextStore.open(':memory:')
    seed(store)
    const recent = store.recentEvents(2)
    expect(recent.map((entry) => entry.seq)).toEqual([7, 6])
    expect(recent[0].event.type).toBe('session.ended')
    expect(store.recentEvents(100)).toHaveLength(7)
    expect(store.firstEvent()?.type).toBe('task.upserted')
    expect(ContextStore.open(':memory:').firstEvent()).toBeUndefined()
    store.close()
  })

  it('replays the event log into the same state', () => {
    const store = ContextStore.open(':memory:')
    seed(store)
    const before = store.snapshot()
    store.rebuild()
    expect(store.snapshot()).toEqual(before)
    store.close()
  })
})
