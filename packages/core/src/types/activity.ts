import type { AgentType } from './agent'
import type { EvidenceType } from './evidence'

export type ActivityType = 'file-change' | 'task-update' | 'decision' | 'test-result' | 'handoff' | 'session' | 'commit'

export interface ActivityEvent {
  id: string
  projectId: string
  type: ActivityType
  title: string
  description: string
  agent?: AgentType
  evidenceType: EvidenceType
  timestamp: string
  taskId?: string
  fileId?: string
  handoffId?: string
}
