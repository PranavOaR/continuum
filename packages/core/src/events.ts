import type { IdentityKey, ContentHash } from './evidenceRules'
import type { AgentType, ChangeType, EvidenceType, MemoryKind } from './types'

/**
 * Immutable facts appended to a workspace's event log. Every adapter, watcher
 * and CLI command speaks this vocabulary; projectors fold it into the context graph.
 */
interface EventBase<TType extends string, TPayload> {
  type: TType
  payload: TPayload
  evidence: EvidenceType
  /** Where the event came from, e.g. `watcher:git`, `adapter:claude-code`, `cli`. */
  source: string
  occurredAt: string
  /** Git revision at the time, when known. */
  revision?: string
}

export type SessionStartedEvent = EventBase<'session.started', { sessionId: string; agent: AgentType; taskId?: string }>
export type SessionEndedEvent = EventBase<'session.ended', { sessionId: string; summary?: string }>

export type FileChangedEvent = EventBase<
  'file.changed',
  { path: string; contentHash: ContentHash | null; changeType: ChangeType; additions?: number; deletions?: number; sessionId?: string; taskId?: string }
>

export type CheckRecordedEvent = EventBase<
  'check.recorded',
  { name: string; command: string; exitCode: number; durationMs: number; ranAgainst: Record<IdentityKey, ContentHash>; outputTail?: string }
>

export type MemoryRecordedEvent = EventBase<
  'memory.recorded',
  { id: string; kind: MemoryKind; title: string; body: string; taskId?: string; anchors: Record<IdentityKey, ContentHash> }
>

export type TaskUpsertedEvent = EventBase<'task.upserted', { id: string; title: string; objective?: string; status: 'planned' | 'in-progress' | 'blocked' | 'completed' }>

export type ContinuumEvent =
  | SessionStartedEvent
  | SessionEndedEvent
  | FileChangedEvent
  | CheckRecordedEvent
  | MemoryRecordedEvent
  | TaskUpsertedEvent

export type ContinuumEventType = ContinuumEvent['type']
