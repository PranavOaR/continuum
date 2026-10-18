import type { AgentType } from './agent'
import type { EvidenceType } from './evidence'
import type { TaskStatus } from './task'

export interface Project {
  id: string
  name: string
  description: string
  repositoryName: string
  branch: string
  stack: string[]
  lastActiveAgent: AgentType
  currentTaskId?: string
  updatedAt: string
}

/** A project's status is derived from its current task; no current task means idle. */
export type ProjectStatus = TaskStatus | 'idle'

export type ChangeType = 'added' | 'modified' | 'deleted'

export type FileStatus = 'needs-verification' | 'work-in-progress' | 'verified'

export interface DiffLine {
  kind: 'add' | 'remove' | 'context'
  text: string
}

export interface CodeSymbol {
  name: string
  kind: 'function' | 'type' | 'constant' | 'component'
}

export interface ProjectFile {
  id: string
  projectId: string
  path: string
  changeType: ChangeType
  status: FileStatus
  evidenceType: EvidenceType
  taskId?: string
  revision?: string
  /** What changed. */
  summary: string
  /** Why this file matters to the task. */
  relevance: string
  symbols: CodeSymbol[]
  decisionIds: string[]
  additions: number
  deletions: number
  /**
   * Where the line counts and excerpt come from:
   * - illustrative: demo data, never presented as live repository content
   * - uncommitted: the file's current change against the last commit, read live from git
   * - none: nothing to show (no uncommitted change, or not readable)
   */
  diffSource: 'illustrative' | 'uncommitted' | 'none'
  diff: DiffLine[]
  /** The excerpt was cut short. */
  diffTruncated?: boolean
  updatedAt: string
}

export type VerificationStatus = 'passed' | 'failed' | 'not-run' | 'unknown' | 'out-of-date'

export interface VerificationRecord {
  id: string
  projectId: string
  taskId?: string
  name: string
  command: string
  status: VerificationStatus
  evidenceType: EvidenceType
  lastRunAt?: string
  lastRunRevision?: string
  detail: string
}

export interface AgentSession {
  id: string
  projectId: string
  taskId?: string
  agent: AgentType
  startedAt: string
  endedAt: string
  summary: string
  evidenceType: EvidenceType
}
