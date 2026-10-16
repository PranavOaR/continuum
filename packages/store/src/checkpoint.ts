import type { ContinuumEvent } from '@continuum/core'
import type { EdgeType, GraphNode } from './graphIndex'

/** The projected graph at one point in the log: enough to replay the rest of the log on top of it. */
export interface GraphState {
  nodes: GraphNode[]
  edges: { from: string; type: EdgeType; to: string }[]
}

/** A removed event that is still the first of its source and type, kept for `firstEvent`. */
export interface FirstEvent {
  seq: number
  event: ContinuumEvent
}

export interface Checkpoint {
  /** Every event up to and including this sequence number is folded into `state`. */
  seq: number
  createdAt: string
  state: GraphState
  firstEvents: FirstEvent[]
}

export interface CompactionResult {
  removedEvents: number
  checkpointSeq: number | null
}

/** Keeps the earliest event of every (source, type) pair: the earliest match for any `firstEvent` filter is one of them. */
export function mergeFirstEvents(existing: readonly FirstEvent[], added: readonly FirstEvent[]): FirstEvent[] {
  const firsts = new Map<string, FirstEvent>()
  for (const entry of [...existing, ...added].sort((a, b) => a.seq - b.seq)) {
    const pair = `${entry.event.source}\u0000${entry.event.type}`
    if (!firsts.has(pair)) firsts.set(pair, entry)
  }
  return [...firsts.values()]
}

/**
 * A rewrite of recorded history (used by `forget`). Check coverage arrives
 * inline: events carry `ranAgainst`, and check nodes in the checkpoint carry
 * their last run as `props.lastRun` with `ranAgainst` inline.
 */
export interface HistoryRewrite {
  /** The event to keep, possibly changed, or null to remove it. */
  event(event: ContinuumEvent): ContinuumEvent | null
  /** The compaction checkpoint's graph, rewritten the same way. */
  state(state: GraphState): GraphState
}

export interface RewriteResult {
  removedEvents: number
  changedEvents: number
  /** The compaction checkpoint held matching data and was rewritten. */
  changedCheckpoint: boolean
}

/** What a vacuum managed: shrinking the file, and emptying the write-ahead log that may still hold old pages. */
export interface VacuumResult {
  shrunk: boolean
  walCleared: boolean
}

export const EXPORT_FORMAT = 'continuum-history'
export const EXPORT_VERSION = 1

/**
 * A store's whole history as plain JSON, independent of how objects are
 * stored: coverage manifests and check runs are written inline.
 */
export interface HistoryExport {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: string
  checkpoint: Checkpoint | null
  events: FirstEvent[]
}
