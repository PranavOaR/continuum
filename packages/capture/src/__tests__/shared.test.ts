import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ContinuumEvent } from '@continuum/core'
import { ContextStore } from '@continuum/store'
import { afterEach, describe, expect, it } from 'vitest'
import { scanRepository } from '../scan'
import {
  importSharedEvents,
  parseSharedFile,
  readSharedRecords,
  SHARE_SOURCE,
  SHARED_FILE,
  SHARED_SOURCE,
  SharedFileError,
  sharedFileContent,
  sharedHashOf,
  shareEvent,
  sharedRecordOf,
  type SharedRecord,
} from '../shared'
import { createSandbox, type Sandbox } from '../testing'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const AT = '2026-11-13T09:00:00.000Z'
const noRedaction = (text: string) => text

const record = (overrides: Partial<SharedRecord> = {}): SharedRecord => ({
  id: 'rounding',
  kind: 'decision',
  title: 'Tax rounds to the cent',
  body: 'Math.round, never truncate: the receipts must match the till.',
  anchors: { 'symbol:src/tax.js#addTax': HASH_A },
  evidence: 'agent-reported',
  recordedAt: '2026-11-06T18:40:00.000Z',
  ...overrides,
})

const fileOf = (records: unknown[]) => JSON.stringify({ version: 1, records })

const sandboxes: Sandbox[] = []
const stores: ContextStore[] = []
function openStore() {
  const store = ContextStore.open(':memory:')
  stores.push(store)
  return store
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function remember(store: ContextStore, payload: Extract<ContinuumEvent, { type: 'memory.recorded' }>['payload'], source = 'mcp') {
  store.record({ type: 'memory.recorded', payload, evidence: 'agent-reported', source, occurredAt: AT })
}

describe('parseSharedFile', () => {
  it('reads the records a teammate shared', () => {
    expect(parseSharedFile(fileOf([record()]))).toEqual({ records: [record()], skipped: 0 })
  })

  it('throws a readable error for a file that is not JSON', () => {
    expect(() => parseSharedFile('{ not json')).toThrow(SharedFileError)
    expect(() => parseSharedFile('{ not json')).toThrow(/\.continuum-decisions\.json is not valid JSON/)
  })

  it('throws for a version it does not know', () => {
    expect(() => parseSharedFile(JSON.stringify({ version: 2, records: [] }))).toThrow(/version 2/)
  })

  it('skips records it cannot trust and keeps the rest', () => {
    const bad = [
      record({ id: '' }),
      record({ id: 'two\nlines' }),
      record({ id: 'memory:other' }),
      { ...record(), kind: 'next-action' },
      record({ title: 'x'.repeat(201) }),
      record({ anchors: { 'file:/etc/passwd': HASH_A } }),
      record({ anchors: { 'file:../outside.js': HASH_A } }),
      record({ anchors: { 'file:C:/Windows/win.ini': HASH_A } }),
      record({ anchors: { 'file:src/a.js': 'not-a-hash' } }),
      record({ anchors: { 'session:abc': HASH_A } }),
      { ...record(), recordedAt: 42 },
    ]
    const { records, skipped } = parseSharedFile(fileOf([...bad, record({ id: 'kept' })]))
    expect(records.map((shared) => shared.id)).toEqual(['kept'])
    expect(skipped).toBe(bad.length)
  })

  it('never lets a shared record claim to be verified', () => {
    const [shared] = parseSharedFile(fileOf([{ ...record(), evidence: 'verified' }])).records
    expect(shared.evidence).toBe('agent-reported')
  })

  it('keeps a review someone shared', () => {
    const [shared] = parseSharedFile(fileOf([record({ review: 'resolved' })])).records
    expect(shared.review).toBe('resolved')
  })
})

describe('sharedFileContent', () => {
  it('writes the records in id order, two-space indented, ending in a newline, so diffs stay small', () => {
    const content = sharedFileContent([record({ id: 'b' }), record({ id: 'a' })])
    expect(content.endsWith('}\n')).toBe(true)
    const parsed = JSON.parse(content) as { version: number; records: SharedRecord[] }
    expect(parsed.version).toBe(1)
    expect(parsed.records.map((shared) => shared.id)).toEqual(['a', 'b'])
    expect(content).toContain('\n  "records": [\n')
    expect(parseSharedFile(content).records).toHaveLength(2)
  })
})

describe('readSharedRecords', () => {
  it('reads nothing when the repository shares nothing', async () => {
    const repo = createSandbox()
    sandboxes.push(repo)
    expect(await readSharedRecords(repo.root)).toEqual({ records: [], skipped: 0 })
  })
})

describe('sharedRecordOf', () => {
  it('takes what a teammate needs from a stored record and leaves the local task out', () => {
    const store = openStore()
    remember(store, { id: 'rounding', kind: 'decision', title: 'Tax rounds to the cent', body: 'Math.round.', taskId: 'tax', anchors: { 'symbol:src/tax.js#addTax': HASH_A } })
    const shared = sharedRecordOf(store.graph.get('memory:rounding')!)
    expect(shared).toEqual({ id: 'rounding', kind: 'decision', title: 'Tax rounds to the cent', body: 'Math.round.', anchors: { 'symbol:src/tax.js#addTax': HASH_A }, evidence: 'agent-reported', recordedAt: AT })
  })
})

describe('importSharedEvents', () => {
  it('records a decision this clone has not seen, from the shared file, as reported rather than set by you', () => {
    const store = openStore()
    // "Set by you" would be untrue here: a teammate typed it. Shared records never claim more than agent-reported.
    const events = importSharedEvents(store, [record({ evidence: 'user-reported' })], noRedaction, AT)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'memory.recorded', source: SHARED_SOURCE, evidence: 'agent-reported', payload: { id: 'rounding', sharedHash: sharedHashOf(record({ evidence: 'user-reported' })) } })
    expect(events[0].payload).not.toHaveProperty('taskId')
  })

  it('masks the text with this repository’s redaction before storing it', () => {
    const store = openStore()
    const [event] = importSharedEvents(store, [record({ body: 'key sk-live-123' })], (text) => text.replace('sk-live-123', '[REDACTED]'), AT)
    expect(event.payload.body).toBe('key [REDACTED]')
  })

  it('records nothing the second time the same file is read', () => {
    const store = openStore()
    store.transact(() => importSharedEvents(store, [record()], noRedaction, AT))
    expect(importSharedEvents(store, [record()], noRedaction, AT)).toEqual([])
  })

  it('takes a teammate’s newer version of a record it imported', () => {
    const store = openStore()
    store.transact(() => importSharedEvents(store, [record()], noRedaction, AT))
    const newer = record({ title: 'Tax rounds half up to the cent', anchors: { 'symbol:src/tax.js#addTax': HASH_B } })
    const [event] = importSharedEvents(store, [newer], noRedaction, AT)
    expect(event.payload.title).toBe('Tax rounds half up to the cent')
    store.transact(() => [event])
    expect(store.graph.get('memory:rounding')?.props.anchors).toEqual({ 'symbol:src/tax.js#addTax': HASH_B })
  })

  it('keeps your own review of an imported record while the file has not changed', () => {
    const store = openStore()
    store.transact(() => importSharedEvents(store, [record()], noRedaction, AT))
    remember(store, { id: 'rounding', kind: 'decision', title: 'Tax rounds to the cent', body: record().body, anchors: record().anchors, review: 'resolved', sharedHash: sharedHashOf(record()) }, 'dashboard')
    expect(importSharedEvents(store, [record()], noRedaction, AT)).toEqual([])
  })

  it('never overwrites a record of this clone that did not come from the file', () => {
    const store = openStore()
    remember(store, { id: 'rounding', kind: 'decision', title: 'Something else entirely', body: '', anchors: {} })
    expect(importSharedEvents(store, [record()], noRedaction, AT)).toEqual([])
  })
})

describe('shareEvent', () => {
  it('marks the local record as the version in the file, keeping its label and date', () => {
    const store = openStore()
    remember(store, { id: 'rounding', kind: 'decision', title: 'Tax rounds to the cent', body: record().body, taskId: 'tax', anchors: record().anchors })
    const node = store.graph.get('memory:rounding')!
    const shared = sharedRecordOf(node)!
    store.transact(() => [shareEvent(node, shared, '2026-11-13T12:00:00.000Z')])
    const after = store.graph.get('memory:rounding')!
    expect(after.props.sharedHash).toBe(sharedHashOf(shared))
    expect(after.props.evidence).toBe('agent-reported')
    expect(after.props.recordedAt ?? after.updatedAt).toBe(AT)
    expect(store.graph.neighbors('memory:rounding', { direction: 'out', types: ['informs'] })).toEqual(['task:tax'])
    expect(shareEvent(node, shared, AT).source).toBe(SHARE_SOURCE)
    // The file is now what this clone has, so reading it back records nothing.
    expect(importSharedEvents(store, [shared], noRedaction, AT)).toEqual([])
  })
})

describe('scanRepository with a shared file', () => {
  it('brings a decision a teammate committed into this clone’s store', async () => {
    const repo = createSandbox({ 'src/tax.js': 'exports.addTax = () => 0\n', [SHARED_FILE]: fileOf([record()]) })
    sandboxes.push(repo)
    const store = openStore()
    const result = await scanRepository(store, repo.root, { now: () => new Date(AT) })
    expect(result.shared).toEqual({ imported: 1, skipped: 0, error: null })
    expect(store.graph.get('memory:rounding')?.props.title).toBe('Tax rounds to the cent')
    expect((await scanRepository(store, repo.root, { now: () => new Date(AT) })).shared.imported).toBe(0)
  })

  it('still scans when the shared file is broken, and says why it skipped it', async () => {
    const repo = createSandbox({ 'a.js': 'a', [SHARED_FILE]: '{ broken' })
    sandboxes.push(repo)
    const store = openStore()
    const result = await scanRepository(store, repo.root, { now: () => new Date(AT) })
    expect(result.changes.map((change) => change.path)).toContain('a.js')
    expect(result.shared.imported).toBe(0)
    expect(result.shared.error).toMatch(/not valid JSON/)
    expect(readFileSync(join(repo.root, SHARED_FILE), 'utf8')).toBe('{ broken')
  })
})
