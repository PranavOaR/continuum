import {
  NotFoundError,
  type ActivityEvent,
  type AttentionItem,
  type ContinuumService,
  type MemoryGraph,
  type OverviewData,
  type ProjectSummary,
  type ProjectTask,
  type ProjectWorkspace,
  type SearchResult,
  type TaskChange,
} from '@continuum/core'
import { InvalidConfigError, openWorkspace, repositoryRedactor, type Redactor } from '@continuum/capture'
import { applyTaskChange, renderHandoff, summarizeTask } from '@continuum/context'
import { keys } from '@continuum/store'
import { toActivity } from './mapActivity'
import { toGraph } from './mapGraph'
import { allChangedFileNodes, toFiles, toProject } from './mapProject'
import { toMemory, toSessions, toVerification } from './mapRecords'
import { currentTask, toTasks } from './mapTasks'
import { loadSnapshot, type RepoSnapshot } from './snapshot'

/** Repeated screen loads within this window reuse one read of the store and working tree. */
export const SNAPSHOT_TTL_MS = 1_000
const RECENT_EVENTS = 8
const MAX_SEARCH_RESULTS = 20

export interface Repository {
  projectId: string
  /** Any directory inside the repository. */
  cwd: string
}

export interface LocalServiceOptions {
  now?: () => Date
  ttlMs?: number
  /** Told when a repository cannot be read; the others keep working. */
  onError?: (projectId: string, error: unknown) => void
}

/** One served repository could not be read (moved, deleted, or Continuum removed); the others still work. */
export class ProjectUnavailableError extends Error {
  constructor(projectId: string, cause?: unknown) {
    super(
      cause instanceof InvalidConfigError
        ? `Continuum is not showing project "${projectId}": ${cause.message}`
        : `Continuum could not read project "${projectId}". Check that the repository still exists and has been set up with continuum init.`,
    )
    this.name = 'ProjectUnavailableError'
  }
}

type Loaded = { projectId: string; snapshot: RepoSnapshot } | { projectId: string; error: unknown }

function attentionFor(snapshot: RepoSnapshot): AttentionItem[] {
  const to = `/app/projects/${snapshot.projectId}`
  const checks = snapshot.state.checks
    .filter((check) => check.status === 'out-of-date' || check.status === 'failed')
    .map<AttentionItem>((check) => ({
      id: `${snapshot.projectId}~attention~check~${check.name}`,
      kind: 'awaiting-verification',
      title: check.status === 'failed' ? `${check.name} is failing` : `${check.name} is out of date`,
      description: check.status === 'failed' ? `Last run exited ${check.exitCode ?? '?'}.` : `${check.changed.length} covered file(s) changed since it ran.`,
      projectId: snapshot.projectId,
      to: `${to}#verification`,
    }))
  const decisions = snapshot.state.decisions
    .filter((decision) => decision.status === 'anchor-changed')
    .map<AttentionItem>((decision) => ({
      id: `${snapshot.projectId}~attention~memory~${decision.id}`,
      kind: 'stale-context',
      title: `Decision may be stale: ${decision.title}`,
      description: `Its anchored code changed: ${decision.changed.join(', ')}.`,
      projectId: snapshot.projectId,
      to,
    }))
  const blocked = toTasks(snapshot)
    .filter((task) => task.status === 'blocked')
    .map<AttentionItem>((task) => ({
      id: `${snapshot.projectId}~attention~task~${task.id}`,
      kind: 'incomplete-task',
      title: `Blocked: ${task.title}`,
      description: task.nextAction ?? 'The agent reported this task as blocked.',
      projectId: snapshot.projectId,
      to: `${to}?task=${encodeURIComponent(task.id)}`,
    }))
  return [...blocked, ...checks, ...decisions]
}

function summarize(snapshot: RepoSnapshot): ProjectSummary {
  const task = currentTask(snapshot)
  const criteria = task?.acceptanceCriteria ?? []
  // Progress follows acceptance criteria when there are any, otherwise steps.
  const progress =
    criteria.length > 0
      ? { done: criteria.filter((criterion) => criterion.status === 'complete').length, total: criteria.length }
      : { done: task?.completedSteps.length ?? 0, total: (task?.completedSteps.length ?? 0) + (task?.remainingSteps.length ?? 0) }
  return {
    project: toProject(snapshot),
    ...(task ? { currentTask: task } : {}),
    status: task?.status ?? 'idle',
    progress,
    changedFileCount: allChangedFileNodes(snapshot).length,
  }
}

const newestFirst = (a: ActivityEvent, b: ActivityEvent) => b.timestamp.localeCompare(a.timestamp)

/** Where dashboard edits come from in the event log. */
export const DASHBOARD_SOURCE = 'dashboard'

/**
 * A next action typed in the dashboard goes into every later briefing, so it is masked like
 * agent text. Steps and criteria are not: an edit only names one already stored, by its text.
 */
async function redactorFor(projectId: string, root: string): Promise<Redactor> {
  try {
    return await repositoryRedactor(root)
  } catch (error) {
    if (error instanceof InvalidConfigError) throw new ProjectUnavailableError(projectId, error)
    throw error
  }
}

function maskTyped(change: TaskChange, redactor: Redactor): TaskChange {
  return change.kind === 'next-action' && change.nextAction ? { ...change, nextAction: redactor.redact(change.nextAction) } : change
}

/**
 * ContinuumService backed by real repositories' context stores. Everything is
 * derived from recorded evidence; the only write is a task edit you make in
 * the dashboard, recorded as user-reported.
 */
export class LocalContinuumService implements ContinuumService {
  private readonly repositories: readonly Repository[]
  private readonly now: () => Date
  private readonly ttlMs: number
  private readonly onError: (projectId: string, error: unknown) => void
  /** One load at a time: concurrent requests share it, and freshness counts from when it finished. */
  private cache: { loaded: Promise<Loaded[]>; finishedAt: number | null } | null = null

  constructor(repositories: readonly Repository[], options: LocalServiceOptions = {}) {
    this.repositories = repositories
    this.now = options.now ?? (() => new Date())
    this.ttlMs = options.ttlMs ?? SNAPSHOT_TTL_MS
    this.onError = options.onError ?? (() => {})
  }

  /** Forgets the cached snapshot, e.g. when the change feed reports new records, so the next request reads them. */
  invalidate(): void {
    // A load still in flight may have read before the change; later requests start a fresh one.
    this.cache = null
  }

  private load(): Promise<Loaded[]> {
    const { cache } = this
    if (cache && (cache.finishedAt === null || Date.now() - cache.finishedAt < this.ttlMs)) return cache.loaded
    const loaded = Promise.all(
      this.repositories.map(async ({ projectId, cwd }): Promise<Loaded> => {
        try {
          return { projectId, snapshot: await loadSnapshot(projectId, cwd, this.now()) }
        } catch (error) {
          this.onError(projectId, error)
          return { projectId, error }
        }
      }),
    )
    const entry: { loaded: Promise<Loaded[]>; finishedAt: number | null } = { loaded, finishedAt: null }
    this.cache = entry
    void loaded.then(() => {
      entry.finishedAt = Date.now()
    })
    return loaded
  }

  /** Readable repositories; unreadable ones are left out of lists (and reported through onError). */
  private async snapshots(): Promise<RepoSnapshot[]> {
    return (await this.load()).flatMap((result) => ('snapshot' in result ? [result.snapshot] : []))
  }

  private async snapshot(projectId: string): Promise<RepoSnapshot> {
    const found = (await this.load()).find((result) => result.projectId === projectId)
    if (!found) throw new NotFoundError('Project', projectId)
    if (!('snapshot' in found)) throw new ProjectUnavailableError(projectId, found.error)
    return found.snapshot
  }

  async getOverview(): Promise<OverviewData> {
    const snapshots = await this.snapshots()
    const projects = snapshots.map(summarize)
    return {
      projects,
      activeTaskCount: snapshots.flatMap(toTasks).filter((task) => task.status === 'in-progress' || task.status === 'blocked').length,
      changedFileCount: projects.reduce((total, project) => total + project.changedFileCount, 0),
      recentEvents: snapshots.flatMap(toActivity).sort(newestFirst).slice(0, RECENT_EVENTS),
      attention: snapshots.flatMap(attentionFor),
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return (await this.snapshots()).map(summarize)
  }

  async listTasks(): Promise<ProjectTask[]> {
    return (await this.snapshots()).flatMap(toTasks)
  }

  async getWorkspace(projectId: string): Promise<ProjectWorkspace> {
    const snapshot = await this.snapshot(projectId)
    return {
      project: toProject(snapshot),
      tasks: toTasks(snapshot),
      files: toFiles(snapshot),
      events: toActivity(snapshot),
      verification: toVerification(snapshot),
      memory: toMemory(snapshot),
      sessions: toSessions(snapshot),
      setup: { agentConnected: snapshot.agentConnected },
    }
  }

  async listActivity(): Promise<ActivityEvent[]> {
    return (await this.snapshots()).flatMap(toActivity).sort(newestFirst)
  }

  async getMemoryGraph(projectId: string): Promise<MemoryGraph> {
    return toGraph(await this.snapshot(projectId))
  }

  async updateTask(projectId: string, taskId: string, change: TaskChange): Promise<ProjectTask> {
    const repository = this.repositories.find((candidate) => candidate.projectId === projectId)
    if (!repository) throw new NotFoundError('Project', projectId)
    const { workspace, store } = await openWorkspace(repository.cwd)
    try {
      const masked = maskTyped(change, await redactorFor(projectId, workspace.root))
      store.transact(() => {
        const node = store.graph.get(keys.task(taskId))
        if (!node || node.kind !== 'task') throw new NotFoundError('Task', taskId)
        const payload = applyTaskChange(summarizeTask(store, node), masked)
        return [{ type: 'task.upserted', payload, evidence: 'user-reported', source: DASHBOARD_SOURCE, occurredAt: this.now().toISOString() }]
      })
    } finally {
      store.close()
    }
    this.invalidate()
    const task = (await this.getWorkspace(projectId)).tasks.find((candidate) => candidate.id === taskId)
    if (!task) throw new NotFoundError('Task', taskId)
    return task
  }

  async getBriefing(projectId: string): Promise<string> {
    const snapshot = await this.snapshot(projectId)
    return renderHandoff(snapshot.state, { now: this.now() })
  }

  async search(query: string): Promise<SearchResult[]> {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    const results: SearchResult[] = []
    for (const snapshot of await this.snapshots()) {
      const to = `/app/projects/${snapshot.projectId}`
      if (snapshot.name.toLowerCase().includes(needle)) results.push({ id: snapshot.projectId, kind: 'project', title: snapshot.name, subtitle: snapshot.root, to })
      for (const task of toTasks(snapshot).filter((candidate) => candidate.title.toLowerCase().includes(needle))) {
        results.push({ id: task.id, kind: 'task', title: task.title, subtitle: snapshot.name, to: `${to}?task=${encodeURIComponent(task.id)}` })
      }
      for (const file of toFiles(snapshot).filter((candidate) => candidate.path.toLowerCase().includes(needle))) {
        results.push({ id: file.id, kind: 'file', title: file.path, subtitle: snapshot.name, to: `${to}?file=${encodeURIComponent(file.id)}` })
      }
      for (const event of toActivity(snapshot).filter((candidate) => candidate.title.toLowerCase().includes(needle))) {
        results.push({ id: event.id, kind: 'activity', title: event.title, subtitle: snapshot.name, to: `/app/activity?project=${snapshot.projectId}` })
      }
    }
    return results.slice(0, MAX_SEARCH_RESULTS)
  }
}
