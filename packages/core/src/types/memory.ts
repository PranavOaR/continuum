import type { AgentType } from './agent'
import type { EvidenceType } from './evidence'

export type MemoryKind = 'decision' | 'known-issue' | 'previous-attempt' | 'next-action'

/** The kinds of record you can add from the dashboard. */
export type NewMemoryKind = Extract<MemoryKind, 'decision' | 'known-issue'>

export interface NewMemory {
  kind: NewMemoryKind
  title: string
  body?: string
  taskId?: string
}

/** Your verdict on a record: `resolved` takes it out of briefings; `still-valid` vouches for it against today's code. */
export type MemoryReview = 'resolved' | 'still-valid'

export type MemorySource = 'architecture-decision' | 'file-change' | 'test-result' | 'agent-summary' | 'user-note' | 'derived'

export interface MemoryRecord {
  id: string
  projectId: string
  kind: MemoryKind
  title: string
  body: string
  source: MemorySource
  sourceDetail: string
  evidenceType: EvidenceType
  agent?: AgentType
  taskId?: string
  relatedFileIds: string[]
  createdAt: string
  review?: MemoryReview
}

export type GraphNodeType = 'project' | 'task' | 'session' | 'decision' | 'verification' | 'file' | 'symbol'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  /** Secondary label, e.g. a memory kind or task status. */
  subtitle: string
  description: string
  source: string
  evidenceType: EvidenceType
  updatedAt: string
  /** Workspace link for entities that have a page or drawer. */
  href?: string
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  label: string
}

export interface MemoryGraph {
  projectId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}
