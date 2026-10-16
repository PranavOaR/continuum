import type { AgentType } from './agent'

export type HandoffStatus = 'draft' | 'prepared' | 'copied'

export type ContextCategory =
  | 'project-overview'
  | 'current-task'
  | 'file-changes'
  | 'decisions'
  | 'previous-attempts'
  | 'verification'
  | 'next-steps'

export interface HandoffDraft {
  projectId: string
  taskId: string
  sourceAgent: AgentType
  targetAgent: AgentType
  includedContext: ContextCategory[]
}

export interface Handoff extends HandoffDraft {
  id: string
  status: HandoffStatus
  createdAt: string
  updatedAt: string
}
