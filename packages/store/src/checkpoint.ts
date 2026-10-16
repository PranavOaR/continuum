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
