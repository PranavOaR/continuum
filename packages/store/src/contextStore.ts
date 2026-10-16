import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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
import { GraphIndex, type EdgeType, type GraphNode, type UpsertInput } from './graphIndex'
import { canonicalJson, hashRecord } from './hash'
import { keys, kindOf } from './keys'
import { project, type Mutations } from './projector'
import { migrate, readSchemaVersion } from './migrations'
import { SCHEMA } from './schema'

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

  /** The oldest event in the log, optionally the oldest from one source and of one type. */
  firstEvent(filter: { source?: string; type?: ContinuumEvent['type'] } = {}): ContinuumEvent | undefined {
    const row = this.db
      .prepare(
        'SELECT type, payload, evidence, source, occurred_at, revision FROM events WHERE (?1 IS NULL OR source = ?1) AND (?2 IS NULL OR type = ?2) ORDER BY seq LIMIT 1',
      )
      .get(filter.source ?? null, filter.type ?? null) as EventRow | undefined
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

  /** Discards all projections and replays the event log. */
  rebuild(): void {
    const events = [...this.events()]
    this.transaction(() => {
      this.db.exec('DELETE FROM edges; DELETE FROM node_history; DELETE FROM nodes;')
      this.graphIndex = new GraphIndex()
      for (const event of events) project(this, event)
    })
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

  checkRun(name: string): RecordedRun | undefined {
    const runHash = this.graphIndex.get(keys.check(name))?.props.lastRunHash
    if (typeof runHash !== 'string') return undefined
    return this.getObject(runHash)?.value as RecordedRun | undefined
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
