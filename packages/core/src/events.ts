import type { IdentityKey, ContentHash } from './evidenceRules'
import type { AgentType, ChangeType, EvidenceType, MemoryKind, TaskField } from './types'

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
/** The agent's latest account of where it is (e.g. its last message in a turn). Agent-reported, never verified. */
export type SessionProgressEvent = EventBase<'session.progress', { sessionId: string; note: string }>
export type SessionEndedEvent = EventBase<'session.ended', { sessionId: string; summary?: string }>
/** The session took up a task (started or updated it through the MCP tools): its edits belong to that task. */
export type SessionTaskEvent = EventBase<'session.task', { sessionId: string; taskId: string }>
/** What the person typed to the agent. Recorded only when prompt capture is turned on; redacted. */
export type SessionPromptedEvent = EventBase<'session.prompted', { sessionId: string; prompt: string }>

export type FileChangedEvent = EventBase<
  'file.changed',
  { path: string; contentHash: ContentHash | null; changeType: ChangeType; additions?: number; deletions?: number; sessionId?: string; taskId?: string }
>

export type CheckRecordedEvent = EventBase<
  'check.recorded',
  {
    name: string
    command: string
    exitCode: number
    durationMs: number
    /** Hash of the stored coverage manifest (identity → content hash): runs against the same tree share one. */
    coverage?: ContentHash
    /** The manifest inline, as stores written before manifests recorded it. */
    ranAgainst?: Record<IdentityKey, ContentHash>
    outputTail?: string
  }
>

export type MemoryRecordedEvent = EventBase<
  'memory.recorded',
  { id: string; kind: MemoryKind; title: string; body: string; taskId?: string; anchors: Record<IdentityKey, ContentHash> }
>

export interface RecordedCriterion {
  text: string
  met: boolean
}

/** A full snapshot of a task as an agent reported it; each event replaces the previous state. */
export type TaskUpsertedEvent = EventBase<
  'task.upserted',
  {
    id: string
    title: string
    objective?: string
    status: 'planned' | 'in-progress' | 'blocked' | 'completed'
    nextAction?: string
    acceptanceCriteria?: RecordedCriterion[]
    completedSteps?: string[]
    remainingSteps?: string[]
    /** Dashboard edits only: the fields you changed. Only these carry your label; the rest stays the agent's. */
    editedFields?: TaskField[]
  }
>

/**
 * A commit that appeared in the repository (by anyone). `baseline` marks the
 * commit that was already HEAD when Continuum started watching: context, not work.
 */
export type CommitRecordedEvent = EventBase<'commit.recorded', { hash: string; message: string; files: string[]; baseline?: boolean; committedAt?: string }>

/** Something was deliberately forgotten. Says how much, never what. */
export type DataForgottenEvent = EventBase<'data.forgotten', { scope: 'path' | 'session' | 'before'; removedEvents: number; changedEvents: number }>

export type ContinuumEvent =
  | SessionStartedEvent
  | SessionProgressEvent
  | SessionEndedEvent
  | SessionTaskEvent
  | SessionPromptedEvent
  | FileChangedEvent
  | CheckRecordedEvent
  | MemoryRecordedEvent
  | TaskUpsertedEvent
  | CommitRecordedEvent
  | DataForgottenEvent

export type ContinuumEventType = ContinuumEvent['type']
