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
} from '@continuum/core'
import { renderHandoff } from '@continuum/context'
import { toActivity } from './mapActivity'
import { toGraph } from './mapGraph'
import { toFiles, toProject } from './mapProject'
import { toMemory, toSessions, toVerification } from './mapRecords'
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
}

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
  return [...checks, ...decisions]
}

function summarize(snapshot: RepoSnapshot): ProjectSummary {
  return { project: toProject(snapshot), status: 'idle', progress: { done: 0, total: 0 }, changedFileCount: toFiles(snapshot).length }
}

const newestFirst = (a: ActivityEvent, b: ActivityEvent) => b.timestamp.localeCompare(a.timestamp)

/**
 * ContinuumService backed by real repositories' context stores. Everything is
 * read-only and derived from recorded evidence; tasks appear once agents record them.
 */
export class LocalContinuumService implements ContinuumService {
  private readonly repositories: readonly Repository[]
  private readonly now: () => Date
  private readonly ttlMs: number
  private cache: { at: number; snapshots: Promise<RepoSnapshot[]> } | null = null

  constructor(repositories: readonly Repository[], options: LocalServiceOptions = {}) {
    this.repositories = repositories
    this.now = options.now ?? (() => new Date())
    this.ttlMs = options.ttlMs ?? SNAPSHOT_TTL_MS
  }

  private snapshots(): Promise<RepoSnapshot[]> {
    const at = Date.now()
    if (this.cache && at - this.cache.at < this.ttlMs) return this.cache.snapshots
    const snapshots = Promise.all(this.repositories.map((repo) => loadSnapshot(repo.projectId, repo.cwd, this.now())))
    // Never cache a failure: the next request retries.
    snapshots.catch(() => {
      if (this.cache?.snapshots === snapshots) this.cache = null
    })
    this.cache = { at, snapshots }
    return snapshots
  }

  private async snapshot(projectId: string): Promise<RepoSnapshot> {
    const found = (await this.snapshots()).find((snapshot) => snapshot.projectId === projectId)
    if (!found) throw new NotFoundError('Project', projectId)
    return found
  }

  async getOverview(): Promise<OverviewData> {
    const snapshots = await this.snapshots()
    const projects = snapshots.map(summarize)
    return {
      projects,
      activeTaskCount: 0,
      changedFileCount: projects.reduce((total, project) => total + project.changedFileCount, 0),
      recentEvents: snapshots.flatMap(toActivity).sort(newestFirst).slice(0, RECENT_EVENTS),
      attention: snapshots.flatMap(attentionFor),
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return (await this.snapshots()).map(summarize)
  }

  async listTasks(): Promise<ProjectTask[]> {
    return []
  }

  async getWorkspace(projectId: string): Promise<ProjectWorkspace> {
    const snapshot = await this.snapshot(projectId)
    return {
      project: toProject(snapshot),
      tasks: [],
      files: toFiles(snapshot),
      events: toActivity(snapshot),
      verification: toVerification(snapshot),
      memory: toMemory(snapshot),
      sessions: toSessions(snapshot),
    }
  }

  async listActivity(): Promise<ActivityEvent[]> {
    return (await this.snapshots()).flatMap(toActivity).sort(newestFirst)
  }

  async getMemoryGraph(projectId: string): Promise<MemoryGraph> {
    return toGraph(await this.snapshot(projectId))
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
