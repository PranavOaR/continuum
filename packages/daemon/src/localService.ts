import {
  EVIDENCE_LABEL,
  MEMORY_KIND_LABEL,
  DEFAULT_ACTIVITY_PAGE,
  MAX_ACTIVITY_PAGE,
  NotFoundError,
  type ActivityEvent,
  type ActivityPage,
  type ActivityQuery,
  type AttentionItem,
  type ContinuumService,
  type MemoryGraph,
  type MemoryRecord,
  type MemoryReview,
  type NewMemory,
  type NewTask,
  type OverviewData,
  type Profile,
  type RedactionPreview,
  type RepositorySettings,
  type ProjectSummary,
  type ProjectTask,
  type ProjectWorkspace,
  type SearchResult,
  type TaskChange,
  type TaskReplay,
} from '@continuum/core'
import { previewRedaction, readConfig, saveSettings, briefingPreferences, EMPTY_PROFILE, InvalidConfigError, readProfile, writeProfile, openWorkspace, readWorkingTreeWithSymbols, repositoryRedactor, type Redactor } from '@continuum/capture'
import { taskReplay, searchMemory, applyTaskChange, createdTask, isResolved, isTaskNode, liveHashes, newMemory, renderHandoff, reviewedMemory, summarizeTask, taskSummaries } from '@continuum/context'
import { keys } from '@continuum/store'
import { asAgent, ids, storedMemoryId } from './ids'
import { EVENT_TYPES_OF, toActivity, toActivityEvent } from './mapActivity'
import { toGraph } from './mapGraph'
import { allChangedFileNodes, toFiles, toProject } from './mapProject'
import { toMemory, toSessions, toVerification } from './mapRecords'
import { currentTask, toTasks } from './mapTasks'
import { loadSnapshot, type RepoSnapshot } from './snapshot'

/** Repeated screen loads within this window reuse one read of the store and working tree. */
export const SNAPSHOT_TTL_MS = 1_000
const RECENT_EVENTS = 8
const MAX_SEARCH_RESULTS = 20
/** Memory records shown per project, best match first, before the plain-text matches. */
const MAX_MEMORY_RESULTS = 5
/** Events read from the log at a time while filling a page. */
const ACTIVITY_SCAN_BATCH = 500
/** Events one request reads at most; a rare filter over a long log is continued by the next request. */
const MAX_ACTIVITY_SCANNED = 5_000

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
  /** Continuum's per-user folder, which holds your profile; without it the profile is empty and cannot be saved. */
  configDir?: string
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
  const session = snapshot.state.sessions[0]
  return {
    project: toProject(snapshot),
    ...(task ? { currentTask: task } : {}),
    ...(session ? { latestSession: { agent: asAgent(session.agent), note: session.note, lastActivityAt: session.lastActivityAt ?? toProject(snapshot).updatedAt } } : {}),
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
 * derived from recorded evidence; the only writes are what you do in the
 * dashboard (task edits, new tasks, memory records and reviews of them), all
 * recorded as user-reported.
 */
export class LocalContinuumService implements ContinuumService {
  private readonly repositories: readonly Repository[]
  private readonly now: () => Date
  private readonly ttlMs: number
  private readonly onError: (projectId: string, error: unknown) => void
  private readonly configDir: string | undefined
  /** One load at a time: concurrent requests share it, and freshness counts from when it finished. */
  private cache: { loaded: Promise<Loaded[]>; finishedAt: number | null } | null = null

  constructor(repositories: readonly Repository[], options: LocalServiceOptions = {}) {
    this.repositories = repositories
    this.now = options.now ?? (() => new Date())
    this.ttlMs = options.ttlMs ?? SNAPSHOT_TTL_MS
    this.onError = options.onError ?? (() => {})
    this.configDir = options.configDir
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
      setup: { connectedAgents: snapshot.connectedAgents },
    }
  }

  async listActivity(): Promise<ActivityEvent[]> {
    return (await this.snapshots()).flatMap(toActivity).sort(newestFirst)
  }

  /**
   * Pages through the whole log by sequence number. Type and dates are
   * filtered where the log is read; the agent is known only once an event is
   * tied to its session, so it is filtered after, reading on until the page is full.
   */
  async listActivityPage(projectId: string, query: ActivityQuery): Promise<ActivityPage> {
    const snapshot = await this.snapshot(projectId)
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_ACTIVITY_PAGE), MAX_ACTIVITY_PAGE)
    const filter = { ...(query.type ? { types: EVENT_TYPES_OF[query.type] } : {}), ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) }
    const { store } = await openWorkspace(this.repository(projectId).cwd)
    try {
      const events: ActivityEvent[] = []
      let before = query.before
      let scanned = 0
      while (scanned < MAX_ACTIVITY_SCANNED) {
        const rows = store.eventsBefore({ ...filter, limit: ACTIVITY_SCAN_BATCH, ...(before === undefined ? {} : { before }) })
        for (const { seq, event } of rows) {
          scanned += 1
          before = seq
          const shown = toActivityEvent(snapshot, seq, event)
          if (shown && (!query.agent || shown.agent === query.agent)) events.push(shown)
          if (events.length === limit) return { events, nextBefore: seq }
        }
        if (rows.length < ACTIVITY_SCAN_BATCH) return { events, nextBefore: null }
      }
      return { events, nextBefore: before ?? null }
    } finally {
      store.close()
    }
  }

  async getMemoryGraph(projectId: string): Promise<MemoryGraph> {
    return toGraph(await this.snapshot(projectId))
  }

  private repository(projectId: string): Repository {
    const repository = this.repositories.find((candidate) => candidate.projectId === projectId)
    if (!repository) throw new NotFoundError('Project', projectId)
    return repository
  }

  /** What every event you cause from the dashboard shares. */
  private byYou() {
    return { evidence: 'user-reported', source: DASHBOARD_SOURCE, occurredAt: this.now().toISOString() } as const
  }

  private async foundTask(projectId: string, taskId: string): Promise<ProjectTask> {
    this.invalidate()
    const task = (await this.getWorkspace(projectId)).tasks.find((candidate) => candidate.id === taskId)
    if (!task) throw new NotFoundError('Task', taskId)
    return task
  }

  private async foundMemory(projectId: string, memoryId: string): Promise<MemoryRecord> {
    this.invalidate()
    const record = (await this.getWorkspace(projectId)).memory.find((candidate) => candidate.id === memoryId)
    if (!record) throw new NotFoundError('Memory record', memoryId)
    return record
  }

  async createTask(projectId: string, input: NewTask): Promise<ProjectTask> {
    const { workspace, store } = await openWorkspace(this.repository(projectId).cwd)
    let id = ''
    try {
      const redactor = await redactorFor(projectId, workspace.root)
      const masked = {
        ...input,
        title: redactor.redact(input.title),
        ...(input.objective === undefined ? {} : { objective: redactor.redact(input.objective) }),
        ...(input.nextAction === undefined ? {} : { nextAction: redactor.redact(input.nextAction) }),
      }
      store.transact(() => {
        const { task, paused } = createdTask(taskSummaries(store), masked)
        id = task.id
        return [...paused, task].map((payload) => ({ type: 'task.upserted', payload, ...this.byYou() }))
      })
    } finally {
      store.close()
    }
    return this.foundTask(projectId, id)
  }

  async addMemory(projectId: string, input: NewMemory): Promise<MemoryRecord> {
    const { workspace, store } = await openWorkspace(this.repository(projectId).cwd)
    let id = ''
    try {
      const redactor = await redactorFor(projectId, workspace.root)
      const payload = newMemory({ ...input, title: redactor.redact(input.title), ...(input.body === undefined ? {} : { body: redactor.redact(input.body) }) })
      id = payload.id
      store.transact(() => {
        if (input.taskId && !isTaskNode(store.graph.get(keys.task(input.taskId)))) throw new NotFoundError('Task', input.taskId)
        return [{ type: 'memory.recorded', payload, ...this.byYou() }]
      })
    } finally {
      store.close()
    }
    return this.foundMemory(projectId, ids.memory(projectId, id))
  }

  async reviewMemory(projectId: string, memoryId: string, review: MemoryReview): Promise<MemoryRecord> {
    const { workspace, store } = await openWorkspace(this.repository(projectId).cwd)
    const id = storedMemoryId(projectId, memoryId)
    try {
      const tree = await readWorkingTreeWithSymbols(store, workspace.root)
      store.transact(() => {
        const node = id === null ? undefined : store.graph.get(keys.memory(id))
        if (!node || node.kind !== 'memory') throw new NotFoundError('Memory record', memoryId)
        if (review === 'resolved' && isResolved(node)) return []
        return [{ type: 'memory.recorded', payload: reviewedMemory(store, node, review, liveHashes(store, tree)), ...this.byYou() }]
      })
    } finally {
      store.close()
    }
    return this.foundMemory(projectId, memoryId)
  }

  /** One task's history from the whole log; the coverage of each check is read back inline. */
  async getTaskReplay(projectId: string, taskId: string): Promise<TaskReplay> {
    const { store } = await openWorkspace(this.repository(projectId).cwd)
    try {
      if (!store.graph.has(keys.task(taskId))) throw new NotFoundError('Task', taskId)
      const replay = taskReplay([...store.events()].map((event) => store.selfContained(event)), taskId)
      // Compacted history lives in a checkpoint, not as events, so the replay starts after it.
      return store.checkpoint() ? { ...replay, isPartial: true } : replay
    } finally {
      store.close()
    }
  }

  async updateTask(projectId: string, taskId: string, change: TaskChange): Promise<ProjectTask> {
    const { workspace, store } = await openWorkspace(this.repository(projectId).cwd)
    try {
      const masked = maskTyped(change, await redactorFor(projectId, workspace.root))
      store.transact(() => {
        const node = store.graph.get(keys.task(taskId))
        if (!node || node.kind !== 'task') throw new NotFoundError('Task', taskId)
        const payload = applyTaskChange(summarizeTask(store, node), masked)
        return [{ type: 'task.upserted', payload, ...this.byYou() }]
      })
    } finally {
      store.close()
    }
    return this.foundTask(projectId, taskId)
  }

  async getBriefing(projectId: string): Promise<string> {
    const snapshot = await this.snapshot(projectId)
    const preferences = await briefingPreferences(this.configDir, (await repositoryRedactor(snapshot.root)).redact)
    return renderHandoff(snapshot.state, { now: this.now(), preferences })
  }

  async getSettings(projectId: string): Promise<RepositorySettings> {
    return readConfig((await this.snapshot(projectId)).root)
  }

  async updateSettings(projectId: string, change: Partial<RepositorySettings>): Promise<RepositorySettings> {
    const saved = await saveSettings((await this.snapshot(projectId)).root, change)
    this.invalidate()
    return saved
  }

  async previewRedaction(projectId: string, patterns: readonly string[], sample: string): Promise<RedactionPreview> {
    // The project only says whose settings these are; a preview reads and records nothing.
    await this.snapshot(projectId)
    return previewRedaction(patterns, sample)
  }

  async getProfile(): Promise<Profile> {
    return this.configDir ? readProfile(this.configDir) : EMPTY_PROFILE
  }

  async updateProfile(preferences: readonly string[]): Promise<Profile> {
    if (!this.configDir) throw new Error('This server was started without a folder to keep your profile in.')
    return writeProfile(this.configDir, preferences)
  }

  /** Decisions, known issues and attempts whose words match, from each project's record. */
  private async searchMemoryRecords(snapshot: RepoSnapshot, query: string): Promise<SearchResult[]> {
    const { store } = await openWorkspace(this.repository(snapshot.projectId).cwd)
    try {
      return searchMemory(store, snapshot.state, query, { kinds: ['memory'], limit: MAX_MEMORY_RESULTS }).map((record) => ({
        id: ids.memory(snapshot.projectId, record.id),
        kind: 'memory',
        title: record.title,
        subtitle: `${MEMORY_KIND_LABEL[record.kind as keyof typeof MEMORY_KIND_LABEL] ?? 'Note'} · ${EVIDENCE_LABEL[record.evidence]}${record.resolved ? ' · resolved' : ''}`,
        to: `/app/memory?project=${encodeURIComponent(snapshot.projectId)}&node=${encodeURIComponent(`memory:${record.id}`)}`,
      }))
    } finally {
      store.close()
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    const snapshots = await this.snapshots()
    // Memory records match by their words, ranked; they lead, since nothing else finds them.
    const results: SearchResult[] = (
      await Promise.all(
        snapshots.map((snapshot) =>
          this.searchMemoryRecords(snapshot, query).catch((error: unknown) => {
            // One repository's store failing to open must not empty everyone's search; it is reported like any read error.
            this.onError(snapshot.projectId, error)
            return []
          }),
        ),
      )
    ).flat()
    for (const snapshot of snapshots) {
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
