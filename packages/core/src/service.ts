import type {
  ActivityEvent,
  ActivityType,
  AgentSession,
  AgentType,
  MemoryGraph,
  MemoryRecord,
  MemoryReview,
  NewMemory,
  NewTask,
  Project,
  ProjectFile,
  ProjectStatus,
  ProjectTask,
  TaskChange,
  VerificationRecord,
} from './types'

/** The most recent agent session in a project: what it last said, and when. */
export interface LatestSession {
  agent: AgentType
  /** The session's closing summary, else its latest progress note. Agent-reported. */
  note: string | null
  lastActivityAt: string
}

export interface ProjectSummary {
  project: Project
  currentTask?: ProjectTask
  /** Shown when there is no task, so a project's recent work is visible without one. */
  latestSession?: LatestSession
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
  /** Live data only: how far this repository is through first-run setup. */
  setup?: ProjectSetup
}

export interface ProjectSetup {
  /** Agents connected to this repository, whichever they are. */
  connectedAgents: AgentType[]
}

export type AttentionKind = 'incomplete-task' | 'awaiting-verification' | 'stale-context'

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
  /** One page of a project's whole recorded history, back to its first event. */
  listActivityPage(projectId: string, query: ActivityQuery): Promise<ActivityPage>
  getMemoryGraph(projectId: string): Promise<MemoryGraph>
  search(query: string): Promise<SearchResult[]>
  /** The briefing for this project, as `continuum handoff` prints it. */
  getBriefing(projectId: string): Promise<string>
  /** Applies one edit you made to a task and returns the task as it now stands. */
  updateTask(projectId: string, taskId: string, change: TaskChange): Promise<ProjectTask>
  /** Creates a task as yours and returns it. Starting it pauses any other task in progress. */
  createTask(projectId: string, task: NewTask): Promise<ProjectTask>
  /** Adds a decision or known issue as yours and returns it. */
  addMemory(projectId: string, record: NewMemory): Promise<MemoryRecord>
  /** Records your verdict on a memory record and returns it as it now stands. */
  reviewMemory(projectId: string, memoryId: string, review: MemoryReview): Promise<MemoryRecord>
  /** Your preferences, which every repository's briefing carries. */
  getProfile(): Promise<Profile>
  /** Replaces your preferences and returns them as stored. */
  updateProfile(preferences: readonly string[]): Promise<Profile>
}

/** Which stretch of a project's history to read; everything but `before` narrows it. */
export interface ActivityQuery {
  /** Read events older than this cursor: the `nextBefore` of the page before. Omitted for the newest. */
  before?: number
  limit?: number
  type?: ActivityType
  agent?: AgentType
  /** ISO time; events at or after it. */
  from?: string
  /** ISO time; events before it. */
  to?: string
}

export interface ActivityPage {
  /** Newest first. */
  events: ActivityEvent[]
  /** The cursor for the next older page, or null once the first recorded event has been reached. */
  nextBefore: number | null
}

export const DEFAULT_ACTIVITY_PAGE = 50
export const MAX_ACTIVITY_PAGE = 200

/** Your preferences, kept on this machine for every repository: "Use pnpm", "Never push without asking". */
export interface Profile {
  preferences: string[]
}

export const MAX_PREFERENCES = 20
export const MAX_PREFERENCE_CHARS = 300

/** Limits on what you can type into the dashboard; agents are held to the same ones through MCP. */
export const MAX_TITLE_CHARS = 200
export const MAX_TASK_TEXT_CHARS = 500
export const MAX_MEMORY_BODY_CHARS = 4_000

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} "${id}" was not found.`)
    this.name = 'NotFoundError'
  }
}
