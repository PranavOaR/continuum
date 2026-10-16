import type { AgentType } from './agent'
import type { EvidenceType } from './evidence'

export type MemoryKind = 'decision' | 'known-issue' | 'previous-attempt' | 'next-action'

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
