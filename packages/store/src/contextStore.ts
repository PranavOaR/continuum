import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import {
  anchorStatus,
  checkStatus,
  type AnchorStatus,
  type CheckStatus,
  type ContentHash,
  type ContinuumEvent,
  type IdentityKey,
  type RecordedRun,
} from '@continuum/core'
import { EXPORT_FORMAT, EXPORT_VERSION, mergeFirstEvents, type Checkpoint, type CompactionResult, type FirstEvent, type GraphState, type HistoryExport, type HistoryRewrite, type RewriteResult } from './checkpoint'
import { GraphIndex, type EdgeType, type GraphNode, type UpsertInput } from './graphIndex'
import { canonicalJson, hashRecord } from './hash'
import { keys, kindOf } from './keys'
import { COVERAGE_KIND, project, type Mutations } from './projector'
import { migrate, readSchemaVersion } from './migrations'
import { SCHEMA } from './schema'

// Loaded at run time rather than by a static import, which Node resolves before any code runs:
// the CLI first installs a filter for Node 22's "SQLite is experimental" warning.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
type DatabaseSync = InstanceType<typeof DatabaseSync>

const PRIVATE_DIR_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

export interface StoreSnapshot {
  nodes: GraphNode[]
  edges: string[]
}

interface NodeRow {
  key: string
  hash: string | null
  props: string
  updated_at: string
}

interface ObjectRow {
  hash: string
  kind: string
  body: string
}

interface EventRow {
  seq?: number
  type: string
  payload: string
  evidence: string
  source: string
  occurred_at: string
  revision: string | null
}

/**
 * A workspace's local context store.
 *
 * Layer 1 — `objects`: content-addressed, immutable records keyed by hash.
 * Layer 2 — the identity hash map (`GraphIndex`, persisted in `nodes`/`node_history`).
 * Layer 3 — typed edges between identities (`edges`).
 * Source of truth for all three is the append-only `events` log; the rest are projections.
 */
export class ContextStore implements Mutations {
  private readonly db: DatabaseSync
  private graphIndex = new GraphIndex()
  /** Highest event sequence reflected in `graphIndex`; detects writes by other connections. */
  private loadedSeq = 0

  private constructor(db: DatabaseSync) {
    this.db = db
    try {
      db.exec(SCHEMA)
      migrate(db)
    } catch (error) {
      db.close()
      throw error
    }
    this.loadGraph()
  }

  static open(path: string): ContextStore {
    if (path === ':memory:') return new ContextStore(new DatabaseSync(path))
    mkdirSync(dirname(path), { recursive: true, mode: PRIVATE_DIR_MODE })
    const db = new DatabaseSync(path)
    // Captured output and commands can be sensitive; SQLite gives -wal/-shm the same mode.
    chmodSync(path, PRIVATE_FILE_MODE)
    return new ContextStore(db)
  }

  /** Read-only view of the identity map and its graph. Mutate only through `record`. */
  get graph(): GraphIndex {
    return this.graphIndex
  }

  close(): void {
    this.db.close()
  }

  schemaVersion(): number {
    return readSchemaVersion(this.db)
  }

  /** Appends an event and projects it, atomically. On failure nothing is persisted and memory is restored. */
  record(event: ContinuumEvent): void {
    this.recordAll([event])
  }

  /** Appends and projects several events in one transaction: all of them are recorded, or none. */
  recordAll(events: readonly ContinuumEvent[]): void {
    this.transact(() => events)
  }

  /**
   * Holds the write lock, brings the graph up to date with other connections
   * (e.g. a running watcher and a `continuum run`), then records whatever
   * `build` derives from that current graph. Read-decide-write is atomic.
   */
  transact(build: () => readonly ContinuumEvent[]): readonly ContinuumEvent[] {
    let events: readonly ContinuumEvent[] = []
    this.transaction(() => {
      this.refresh()
      events = build()
      const insert = this.db.prepare('INSERT INTO events (type, payload, evidence, source, occurred_at, revision) VALUES (?, ?, ?, ?, ?, ?)')
      for (const event of events) {
        insert.run(event.type, canonicalJson(event.payload), event.evidence, event.source, event.occurredAt, event.revision ?? null)
        project(this, event)
      }
    })
    return events
  }

  /** Reloads the graph if another connection appended events. Returns whether it reloaded. */
  refresh(): boolean {
    if (this.maxSeq() === this.loadedSeq) return false
    this.loadGraph()
    return true
  }

  eventCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number }
    return row.count
  }

  /** The oldest event ever recorded, optionally the oldest from one source and of one type, including events compacted away. */
  firstEvent(filter: { source?: string; type?: ContinuumEvent['type'] } = {}): ContinuumEvent | undefined {
    const matches = (event: ContinuumEvent) => (filter.source === undefined || event.source === filter.source) && (filter.type === undefined || event.type === filter.type)
    const compacted = this.compactedFirstEvents().find((entry) => matches(entry.event))
    if (compacted) return compacted.event
    const row = this.db
      .prepare(
        // Plain placeholders: node:sqlite before 22.14 cannot bind a numbered one (?1) used twice.
        'SELECT type, payload, evidence, source, occurred_at, revision FROM events WHERE (? IS NULL OR source = ?) AND (? IS NULL OR type = ?) ORDER BY seq LIMIT 1',
      )
      .get(filter.source ?? null, filter.source ?? null, filter.type ?? null, filter.type ?? null) as EventRow | undefined
    return row ? toEvent(row) : undefined
  }

  /** The newest events first, with their log sequence numbers (stable ids). */
  recentEvents(limit: number): { seq: number; event: ContinuumEvent }[] {
    const rows = this.db
      .prepare('SELECT seq, type, payload, evidence, source, occurred_at, revision FROM events ORDER BY seq DESC LIMIT ?')
      .all(limit) as unknown as EventRow[]
    return rows.map((row) => ({ seq: row.seq as number, event: toEvent(row) }))
  }

  *events(): Generator<ContinuumEvent> {
    const rows = this.db.prepare('SELECT type, payload, evidence, source, occurred_at, revision FROM events ORDER BY seq').all() as unknown as EventRow[]
    for (const row of rows) yield toEvent(row)
  }

  /** Discards all projections and replays the event log, starting from the compaction checkpoint if there is one. */
  rebuild(): void {
    this.transaction(() => {
      this.writeState(this.checkpoint()?.state ?? { nodes: [], edges: [] })
      for (const event of this.events()) project(this, event)
    })
  }

  /**
   * Returns freed pages to the file system after a compaction. Needs a moment
   * with no other connection reading; returns false if one was, and SQLite
   * reuses the space instead.
   */
  vacuum(): boolean {
    try {
      this.db.exec('VACUUM')
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      return true
    } catch {
      return false
    }
  }

  /**
   * Rewrites recorded history in place, for `forget`. Events, the compaction
   * checkpoint and every projection are rewritten in one transaction. Objects
   * nothing refers to any more are then deleted, and SQLite overwrites freed
   * pages (secure_delete), so removed text does not linger in the file.
   * Call vacuum() afterwards to shrink the file.
   */
  rewriteHistory(rewrite: HistoryRewrite): RewriteResult {
    const rows = this.db.prepare('SELECT seq, type, payload, evidence, source, occurred_at, revision FROM events ORDER BY seq').all() as unknown as (EventRow & { seq: number })[]
    const previous = this.checkpoint()
    let removedEvents = 0
    let changedEvents = 0
    this.db.exec('PRAGMA secure_delete = ON')
    this.transaction(() => {
      const kept: { seq: number; event: ContinuumEvent }[] = []
      for (const row of rows) {
        const original = this.selfContained(toEvent(row))
        const next = rewrite.event(original)
        if (!next) removedEvents += 1
        else {
          if (canonicalJson(next) !== canonicalJson(original)) changedEvents += 1
          kept.push({ seq: row.seq, event: next })
        }
      }
      const checkpoint = previous && {
        ...previous,
        state: this.externalizeRuns(rewrite.state(this.inlineRuns(previous.state))),
        firstEvents: previous.firstEvents.flatMap((entry) => {
          const event = rewrite.event(this.selfContained(entry.event))
          return event ? [{ seq: entry.seq, event: this.withStoredCoverage(event) }] : []
        }),
      }
      this.db.exec('DELETE FROM events')
      const insert = this.db.prepare('INSERT INTO events (seq, type, payload, evidence, source, occurred_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const { seq, event } of kept) {
        const stored = this.withStoredCoverage(event)
        insert.run(seq, stored.type, canonicalJson(stored.payload), stored.evidence, stored.source, stored.occurredAt, stored.revision ?? null)
      }
      if (checkpoint) {
        this.db
          .prepare('UPDATE checkpoints SET state = ?, first_events = ? WHERE id = 1')
          .run(gzipSync(JSON.stringify(checkpoint.state)), JSON.stringify(checkpoint.firstEvents))
      }
      this.writeState(checkpoint?.state ?? { nodes: [], edges: [] })
      for (const { event } of kept) project(this, this.withStoredCoverage(event))
      this.deleteUnreferencedObjects()
    })
    return { removedEvents, changedEvents }
  }

  /** The whole history as self-contained JSON, for backup or moving to another machine. */
  exportHistory(at: Date = new Date()): HistoryExport {
    const rows = this.db.prepare('SELECT seq, type, payload, evidence, source, occurred_at, revision FROM events ORDER BY seq').all() as unknown as (EventRow & { seq: number })[]
    const checkpoint = this.checkpoint()
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: at.toISOString(),
      checkpoint: checkpoint
        ? {
            ...checkpoint,
            state: this.inlineRuns(checkpoint.state),
            firstEvents: checkpoint.firstEvents.map((entry) => ({ seq: entry.seq, event: this.selfContained(entry.event) })),
          }
        : null,
      events: rows.map((row) => ({ seq: row.seq, event: this.selfContained(toEvent(row)) })),
    }
  }

  /** Loads an export into this store, which must be empty. Replaying it gives the exported graph. */
  importHistory(history: HistoryExport): void {
    if (history.format !== EXPORT_FORMAT || history.version !== EXPORT_VERSION) throw new Error('This file is not a Continuum history export this version can read.')
    if (this.eventCount() > 0 || this.checkpoint()) throw new Error('This store already has history; import only into a freshly initialized repository.')
    this.transaction(() => {
      const { checkpoint } = history
      if (checkpoint) {
        const state = this.externalizeRuns(checkpoint.state)
        const firstEvents = checkpoint.firstEvents.map((entry) => ({ seq: entry.seq, event: this.withStoredCoverage(entry.event) }))
        this.db
          .prepare('INSERT INTO checkpoints (id, seq, created_at, state, first_events) VALUES (1, ?, ?, ?, ?)')
          .run(checkpoint.seq, checkpoint.createdAt, gzipSync(JSON.stringify(state)), JSON.stringify(firstEvents))
        this.writeState(state)
      }
      const insert = this.db.prepare('INSERT INTO events (seq, type, payload, evidence, source, occurred_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const { seq, event } of history.events) {
        const stored = this.withStoredCoverage(event)
        insert.run(seq, stored.type, canonicalJson(stored.payload), stored.evidence, stored.source, stored.occurredAt, stored.revision ?? null)
        project(this, stored)
      }
    })
  }

  /** The latest compaction checkpoint, if the log was ever compacted. */
  /** Just the first events kept by compaction, without unpacking the graph state. */
  private compactedFirstEvents(): FirstEvent[] {
    const row = this.db.prepare('SELECT first_events FROM checkpoints WHERE id = 1').get() as { first_events: string } | undefined
    return row ? JSON.parse(row.first_events) : []
  }

  checkpoint(): Checkpoint | undefined {
    const row = this.db.prepare('SELECT seq, created_at, state, first_events FROM checkpoints WHERE id = 1').get() as
      | { seq: number; created_at: string; state: Uint8Array; first_events: string }
      | undefined
    if (!row) return undefined
    return { seq: row.seq, createdAt: row.created_at, state: JSON.parse(gunzipSync(row.state).toString('utf8')), firstEvents: JSON.parse(row.first_events) }
  }

  /**
   * Folds every event that occurred before `before` into a checkpoint of the
   * graph state and removes them from the log, so the store stops growing
   * with old history. Replaying the checkpoint plus the remaining events gives
   * exactly the current graph. The replay runs outside the write lock, so hooks
   * and watchers are never kept waiting; only the swap is transactional.
   */
  compact(before: Date, at: Date = new Date()): CompactionResult {
    const previous = this.checkpoint()
    const fromSeq = previous?.seq ?? 0
    // Everything before the first event inside the window: occurred_at is not strictly ordered by seq.
    const { cutoff } = this.db
      .prepare('SELECT COALESCE((SELECT MIN(seq) - 1 FROM events WHERE occurred_at >= ?1), (SELECT MAX(seq) FROM events)) AS cutoff')
      .get(before.toISOString()) as { cutoff: number | null }
    if (cutoff === null || cutoff <= fromSeq) return { removedEvents: 0, checkpointSeq: previous?.seq ?? null }

    const rows = this.db
      .prepare('SELECT seq, type, payload, evidence, source, occurred_at, revision FROM events WHERE seq > ? AND seq <= ? ORDER BY seq')
      .all(fromSeq, cutoff) as unknown as (EventRow & { seq: number })[]
    const folded = rows.map((row) => ({ seq: row.seq, event: toEvent(row) }))
    const scratch = ContextStore.open(':memory:')
    let state: GraphState
    let objects: ObjectRow[]
    try {
      scratch.transaction(() => scratch.writeState(previous?.state ?? { nodes: [], edges: [] }))
      scratch.recordAll(folded.map(({ event }) => this.selfContained(event)))
      state = scratch.captureState()
      // The replay may create objects the live store lacks (e.g. run records of legacy inline-coverage checks).
      objects = scratch.db.prepare('SELECT hash, kind, body FROM objects').all() as unknown as ObjectRow[]
    } finally {
      scratch.close()
    }
    const firstEvents: FirstEvent[] = mergeFirstEvents(previous?.firstEvents ?? [], folded)

    let removedEvents = 0
    this.transaction(() => {
      // Another process compacted meanwhile: its checkpoint wins and this one is discarded.
      if ((this.checkpoint()?.seq ?? 0) !== fromSeq) return
      const insertObject = this.db.prepare('INSERT OR IGNORE INTO objects (hash, kind, body) VALUES (?, ?, ?)')
      for (const object of objects) insertObject.run(object.hash, object.kind, object.body)
      this.db
        .prepare('INSERT OR REPLACE INTO checkpoints (id, seq, created_at, state, first_events) VALUES (1, ?, ?, ?, ?)')
        .run(cutoff, at.toISOString(), gzipSync(JSON.stringify(state)), JSON.stringify(firstEvents))
      removedEvents = Number(this.db.prepare('DELETE FROM events WHERE seq <= ?').run(cutoff).changes)
    })
    return { removedEvents, checkpointSeq: removedEvents > 0 ? cutoff : (this.checkpoint()?.seq ?? null) }
  }

  // ── Layer 1: content-addressed objects ─────────────────────────

  putObject(kind: string, value: unknown): ContentHash {
    const hash = hashRecord(kind, value)
    this.db.prepare('INSERT OR IGNORE INTO objects (hash, kind, body) VALUES (?, ?, ?)').run(hash, kind, canonicalJson(value))
    return hash
  }

  getObject(hash: ContentHash): { kind: string; value: unknown } | undefined {
    const row = this.db.prepare('SELECT kind, body FROM objects WHERE hash = ?').get(hash) as { kind: string; body: string } | undefined
    return row ? { kind: row.kind, value: JSON.parse(row.body) } : undefined
  }

  // ── Layers 2 & 3: write-through mutations used by the projector ─

  hasNode(key: IdentityKey): boolean {
    return this.graphIndex.has(key)
  }

  upsertNode(key: IdentityKey, input: UpsertInput): void {
    const before = this.graphIndex.get(key)?.history.length ?? 0
    this.graphIndex.upsert(key, input)
    const node = this.graphIndex.get(key) as GraphNode
    this.db
      // A true upsert: INSERT OR REPLACE would delete the row and cascade away its edges and history.
      .prepare(
        'INSERT INTO nodes (key, kind, hash, props, updated_at) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT (key) DO UPDATE SET hash = excluded.hash, props = excluded.props, updated_at = excluded.updated_at',
      )
      .run(key, node.kind, node.hash, canonicalJson(node.props), node.updatedAt)
    node.history.slice(before).forEach((hash, offset) => {
      this.db.prepare('INSERT INTO node_history (key, seq, hash) VALUES (?, ?, ?)').run(key, before + offset, hash)
    })
  }

  link(from: IdentityKey, type: EdgeType, to: IdentityKey): void {
    if (this.graphIndex.link(from, type, to)) {
      this.db.prepare('INSERT OR IGNORE INTO edges (from_key, type, to_key) VALUES (?, ?, ?)').run(from, type, to)
    }
  }

  // ── Evidence queries ───────────────────────────────────────────

  /** Stores a check's coverage manifest once per distinct tree and returns its hash for `check.recorded`. */
  putCoverage(ranAgainst: Readonly<Record<IdentityKey, ContentHash>>): ContentHash {
    return this.putObject(COVERAGE_KIND, ranAgainst)
  }

  /**
   * The event with any stored objects it refers to written inline, so it can
   * be recorded in another store (export, rebuilding a log) on its own.
   */
  selfContained(event: ContinuumEvent): ContinuumEvent {
    if (event.type !== 'check.recorded' || !event.payload.coverage) return event
    const { coverage, ...payload } = event.payload
    const manifest = this.getObject(coverage)
    if (manifest?.kind !== COVERAGE_KIND) throw new Error(`Coverage manifest ${coverage} is missing from the store.`)
    return { ...event, payload: { ...payload, ranAgainst: manifest.value as Record<IdentityKey, ContentHash> } }
  }

  checkRun(name: string): RecordedRun | undefined {
    const runHash = this.graphIndex.get(keys.check(name))?.props.lastRunHash
    if (typeof runHash !== 'string') return undefined
    const run = this.getObject(runHash)?.value as (Omit<RecordedRun, 'ranAgainst'> & { ranAgainst?: RecordedRun['ranAgainst']; coverage?: ContentHash }) | undefined
    if (!run) return undefined
    // Runs recorded before manifests carry their coverage inline.
    const ranAgainst = run.ranAgainst ?? ((run.coverage ? this.getObject(run.coverage)?.value : undefined) as RecordedRun['ranAgainst'] | undefined) ?? {}
    return { ...run, ranAgainst }
  }

  checkStatus(name: string): { status: CheckStatus; changed: IdentityKey[] } {
    return checkStatus(this.checkRun(name), this.graphIndex.currentHashes())
  }

  memoryStatus(id: string): { status: AnchorStatus; changed: IdentityKey[] } {
    const anchors = (this.graphIndex.get(keys.memory(id))?.props.anchors ?? {}) as Record<IdentityKey, ContentHash>
    return anchorStatus(anchors, this.graphIndex.currentHashes())
  }

  /** Deterministic dump of the projected graph, for tests and debugging. */
  snapshot(): StoreSnapshot {
    const nodes = sortedNodes(this.graphIndex)
    const edges = this.graphIndex
      .allEdges()
      .map((edge) => `${edge.from} -${edge.type}-> ${edge.to}`)
      .sort()
    return { nodes, edges }
  }

  // ── internals ──────────────────────────────────────────────────

  private maxSeq(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events').get() as { seq: number }
    return row.seq
  }

  /** IMMEDIATE takes the write lock up front, so concurrent writers queue on busy_timeout instead of failing mid-way. */
  private transaction(work: () => void): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      work()
      this.db.exec('COMMIT')
      this.loadedSeq = this.maxSeq()
    } catch (error) {
      this.db.exec('ROLLBACK')
      this.loadGraph()
      throw error
    }
  }

  /** A check.recorded event with inline coverage, as stored: the manifest becomes an object named by hash. */
  private withStoredCoverage(event: ContinuumEvent): ContinuumEvent {
    if (event.type !== 'check.recorded' || !event.payload.ranAgainst) return event
    const { ranAgainst, ...payload } = event.payload
    return { ...event, payload: { ...payload, coverage: this.putCoverage(ranAgainst) } }
  }

  /** Check nodes carry their last run inline (`props.lastRun`), so a rewrite can see and change its coverage. */
  private inlineRuns(state: GraphState): GraphState {
    return {
      ...state,
      nodes: state.nodes.map((node) => {
        if (node.kind !== 'check' || typeof node.props.lastRunHash !== 'string') return node
        const run = this.getObject(node.props.lastRunHash)?.value as (Record<string, unknown> & { coverage?: ContentHash; ranAgainst?: unknown }) | undefined
        if (!run) return node
        const { coverage, ...rest } = run
        const ranAgainst = rest.ranAgainst ?? (coverage ? this.getObject(coverage)?.value : undefined) ?? {}
        const { lastRunHash: _hash, ...props } = node.props
        return { ...node, props: { ...props, lastRun: { ...rest, ranAgainst } } }
      }),
    }
  }

  /** Stores inline runs and memory records again under their new hashes, the reverse of inlineRuns. */
  private externalizeRuns(state: GraphState): GraphState {
    const informs = new Map(state.edges.filter((edge) => edge.type === 'informs').map((edge) => [edge.from, edge.to.slice('task:'.length)]))
    return {
      ...state,
      nodes: state.nodes.map((node) => {
        if (node.kind === 'check' && node.props.lastRun) {
          const { lastRun, ...props } = node.props
          const { ranAgainst, ...run } = lastRun as { ranAgainst: Record<IdentityKey, ContentHash> }
          const runHash = this.putObject('check-run', { ...run, coverage: this.putCoverage(ranAgainst) })
          return { ...node, hash: runHash, history: node.history.includes(runHash) ? node.history : [...node.history, runHash], props: { ...props, lastRunHash: runHash } }
        }
        if (node.kind === 'memory') {
          const { anchors, kind, title, body } = node.props
          const id = node.key.slice('memory:'.length)
          const recordHash = this.putObject('memory', { id, kind, title, body, taskId: informs.get(node.key), anchors })
          return { ...node, hash: recordHash, props: { ...node.props, recordHash } }
        }
        return node
      }),
    }
  }

  /** Objects reachable from the log and the graph; everything else is removed (forgotten data must not linger). */
  private deleteUnreferencedObjects(): void {
    const referenced = new Set<string>()
    const events = [...this.events(), ...this.compactedFirstEvents().map((entry) => entry.event)]
    for (const event of events) if (event.type === 'check.recorded' && event.payload.coverage) referenced.add(event.payload.coverage)
    for (const kind of ['check', 'memory'] as const) {
      for (const key of this.graphIndex.keysOfKind(kind)) {
        const node = this.graphIndex.get(key) as GraphNode
        for (const hash of [node.props.lastRunHash, node.props.recordHash]) if (typeof hash === 'string') referenced.add(hash)
      }
    }
    for (const hash of [...referenced]) {
      const coverage = (this.getObject(hash)?.value as { coverage?: unknown } | undefined)?.coverage
      if (typeof coverage === 'string') referenced.add(coverage)
    }
    const remove = this.db.prepare('DELETE FROM objects WHERE hash = ?')
    for (const { hash } of this.db.prepare('SELECT hash FROM objects').all() as { hash: string }[]) if (!referenced.has(hash)) remove.run(hash)
  }

  private captureState(): GraphState {
    return { nodes: sortedNodes(this.graphIndex), edges: this.graphIndex.allEdges().map(({ from, type, to }) => ({ from, type, to })) }
  }

  /** Replaces every projection with `state`. Call inside a transaction. */
  private writeState(state: GraphState): void {
    this.db.exec('DELETE FROM edges; DELETE FROM node_history; DELETE FROM nodes;')
    const insertNode = this.db.prepare('INSERT INTO nodes (key, kind, hash, props, updated_at) VALUES (?, ?, ?, ?, ?)')
    const insertHistory = this.db.prepare('INSERT INTO node_history (key, seq, hash) VALUES (?, ?, ?)')
    const insertEdge = this.db.prepare('INSERT INTO edges (from_key, type, to_key) VALUES (?, ?, ?)')
    for (const node of state.nodes) {
      insertNode.run(node.key, node.kind, node.hash, canonicalJson(node.props), node.updatedAt)
      node.history.forEach((hash, index) => insertHistory.run(node.key, index, hash))
    }
    for (const edge of state.edges) insertEdge.run(edge.from, edge.type, edge.to)
    this.loadGraph()
  }

  private loadGraph(): void {
    const graph = new GraphIndex()
    const history = new Map<string, string[]>()
    for (const row of this.db.prepare('SELECT key, hash FROM node_history ORDER BY key, seq').all() as unknown as { key: string; hash: string }[]) {
      history.set(row.key, [...(history.get(row.key) ?? []), row.hash])
    }
    for (const row of this.db.prepare('SELECT key, hash, props, updated_at FROM nodes').all() as unknown as NodeRow[]) {
      graph.restore({
        key: row.key,
        kind: kindOf(row.key),
        hash: row.hash,
        history: history.get(row.key) ?? [],
        props: JSON.parse(row.props),
        updatedAt: row.updated_at,
      })
    }
    for (const row of this.db.prepare('SELECT from_key, type, to_key FROM edges ORDER BY rowid').all() as unknown as { from_key: string; type: EdgeType; to_key: string }[]) {
      graph.link(row.from_key, row.type, row.to_key)
    }
    this.graphIndex = graph
    this.loadedSeq = this.maxSeq()
  }
}

function toEvent(row: EventRow): ContinuumEvent {
  return {
    type: row.type,
    payload: JSON.parse(row.payload),
    evidence: row.evidence,
    source: row.source,
    occurredAt: row.occurred_at,
    ...(row.revision ? { revision: row.revision } : {}),
  } as ContinuumEvent
}

function sortedNodes(graph: GraphIndex): GraphNode[] {
  const all: GraphNode[] = []
  for (const kind of ['project', 'task', 'session', 'file', 'symbol', 'check', 'memory'] as const) {
    for (const key of graph.keysOfKind(kind)) all.push(graph.get(key) as GraphNode)
  }
  return all.sort((a, b) => a.key.localeCompare(b.key)).map((node) => ({ ...node, props: JSON.parse(canonicalJson(node.props)) }))
}
