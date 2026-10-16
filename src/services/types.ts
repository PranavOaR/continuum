import type {
  ActivityEvent,
  AgentSession,
  MemoryGraph,
  MemoryRecord,
  Project,
  ProjectFile,
  ProjectStatus,
  ProjectTask,
  VerificationRecord,
} from '../types'

export interface ProjectSummary {
  project: Project
  currentTask?: ProjectTask
  status: ProjectStatus
  /** Acceptance criteria marked complete vs total, for the current task. */
  progress: { done: number; total: number }
  changedFileCount: number
}

export interface ProjectWorkspace {
  project: Project
  tasks: ProjectTask[]
  files: ProjectFile[]
  events: ActivityEvent[]
  verification: VerificationRecord[]
  memory: MemoryRecord[]
  sessions: AgentSession[]
}

export type AttentionKind = 'incomplete-task' | 'awaiting-verification' | 'stale-context' | 'handoff-review'

export interface AttentionItem {
  id: string
  kind: AttentionKind
  title: string
  description: string
  projectId: string
  to: string
}

export interface OverviewData {
  projects: ProjectSummary[]
  activeTaskCount: number
  changedFileCount: number
  recentEvents: ActivityEvent[]
  attention: AttentionItem[]
}

export type SearchResultKind = 'project' | 'task' | 'file' | 'activity'

export interface SearchResult {
  id: string
  kind: SearchResultKind
  title: string
  subtitle: string
  to: string
}

/**
 * The contract every screen depends on. The demo ships a mock implementation;
 * a future backend (local index, graph store, agent adapters) can implement the
 * same interface without screens changing.
 */
export interface ContinuumService {
  getOverview(): Promise<OverviewData>
  listProjects(): Promise<ProjectSummary[]>
  listTasks(): Promise<ProjectTask[]>
  getWorkspace(projectId: string): Promise<ProjectWorkspace>
  listActivity(): Promise<ActivityEvent[]>
  getMemoryGraph(projectId: string): Promise<MemoryGraph>
  search(query: string): Promise<SearchResult[]>
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} "${id}" was not found in the demo dataset.`)
    this.name = 'NotFoundError'
  }
}
