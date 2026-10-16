import { HOUR } from '../data/clock'
import { MOCK_ACTIVITY } from '../data/mockActivity'
import { MOCK_FILES } from '../data/mockFiles'
import { MOCK_MEMORY } from '../data/mockMemory'
import { MOCK_PROJECTS } from '../data/mockProjects'
import { MOCK_SESSIONS } from '../data/mockSessions'
import { MOCK_TASKS } from '../data/mockTasks'
import { MOCK_VERIFICATION } from '../data/mockVerification'
import type { ActivityEvent, Project, ProjectTask } from '@continuum/core'
import { matchesQuery } from '../utils/search'
import { buildMemoryGraph } from './buildMemoryGraph'
import {
  NotFoundError,
  type AttentionItem,
  type ContinuumService,
  type ProjectSummary,
  type ProjectWorkspace,
  type SearchResult,
} from '@continuum/core'

/** Small artificial delay so loading states are exercised like a real service. */
const MOCK_LATENCY_MS = 120
const RECENT_EVENT_LIMIT = 7
const SEARCH_RESULT_LIMIT = 24
const STALE_CONTEXT_MINUTES = 18 * HOUR
const PENDING_VERIFICATION = new Set(['out-of-date', 'not-run', 'failed', 'unknown'])

function respond<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), MOCK_LATENCY_MS))
}

function byNewest<T>(getTime: (item: T) => string) {
  return (a: T, b: T) => Date.parse(getTime(b)) - Date.parse(getTime(a))
}

function isActiveTask(task: ProjectTask): boolean {
  return task.status !== 'completed'
}

function findCurrentTask(project: Project): ProjectTask | undefined {
  return MOCK_TASKS.find((task) => task.id === project.currentTaskId)
}

function summarize(project: Project): ProjectSummary {
  const currentTask = findCurrentTask(project)
  const criteria = currentTask?.acceptanceCriteria ?? []
  return {
    project,
    currentTask,
    status: currentTask?.status ?? 'idle',
    progress: { done: criteria.filter((c) => c.status === 'complete').length, total: criteria.length },
    changedFileCount: currentTask?.relatedFileIds.length ?? 0,
  }
}

function buildWorkspace(projectId: string): ProjectWorkspace {
  const project = MOCK_PROJECTS.find((candidate) => candidate.id === projectId)
  if (!project) throw new NotFoundError('Project', projectId)
  const belongs = <T extends { projectId: string }>(item: T) => item.projectId === projectId
  return {
    project,
    tasks: MOCK_TASKS.filter(belongs),
    files: MOCK_FILES.filter(belongs),
    events: MOCK_ACTIVITY.filter(belongs).sort(byNewest((event) => event.timestamp)),
    verification: MOCK_VERIFICATION.filter(belongs),
    memory: MOCK_MEMORY.filter(belongs),
    sessions: MOCK_SESSIONS.filter(belongs).sort(byNewest((session) => session.endedAt)),
  }
}

function buildAttention(): AttentionItem[] {
  const items: AttentionItem[] = []
  const minutesSince = (iso: string) => (Date.now() - Date.parse(iso)) / 60_000

  for (const project of MOCK_PROJECTS) {
    const task = findCurrentTask(project)
    if (!task || !isActiveTask(task)) continue
    const taskLink = `/app/projects/${project.id}?task=${task.id}`

    items.push({
      id: `attn-incomplete-${task.id}`,
      kind: 'incomplete-task',
      title: task.status === 'blocked' ? `Blocked: ${task.title}` : `Left incomplete: ${task.title}`,
      description: `${project.name} · ${task.remainingSteps.length} steps remaining`,
      projectId: project.id,
      to: taskLink,
    })

    const pending = MOCK_VERIFICATION.filter((v) => task.verificationIds.includes(v.id) && PENDING_VERIFICATION.has(v.status))
    if (pending.length > 0) {
      items.push({
        id: `attn-verify-${task.id}`,
        kind: 'awaiting-verification',
        title: `${pending.length} ${pending.length === 1 ? 'check' : 'checks'} awaiting verification`,
        description: `${project.name} · ${pending.map((v) => v.name).join(', ')}`,
        projectId: project.id,
        to: `${taskLink}#verification`,
      })
    }

    if (minutesSince(project.updatedAt) > STALE_CONTEXT_MINUTES) {
      items.push({
        id: `attn-stale-${project.id}`,
        kind: 'stale-context',
        title: 'Context may be stale',
        description: `${project.name} · no recorded activity since the last session ended`,
        projectId: project.id,
        to: taskLink,
      })
    }
  }
  return items
}

function searchAll(query: string): SearchResult[] {
  if (query.trim() === '') return []
  const projectName = (id: string) => MOCK_PROJECTS.find((p) => p.id === id)?.name ?? id

  const projects: SearchResult[] = MOCK_PROJECTS.filter((p) => matchesQuery(query, p.name, p.description, p.repositoryName)).map((p) => ({
    id: p.id,
    kind: 'project',
    title: p.name,
    subtitle: p.description,
    to: `/app/projects/${p.id}`,
  }))
  const tasks: SearchResult[] = MOCK_TASKS.filter((t) => matchesQuery(query, t.title, t.description)).map((t) => ({
    id: t.id,
    kind: 'task',
    title: t.title,
    subtitle: `${projectName(t.projectId)} · ${t.status.replace('-', ' ')}`,
    to: `/app/projects/${t.projectId}?task=${t.id}`,
  }))
  const files: SearchResult[] = MOCK_FILES.filter((f) => matchesQuery(query, f.path)).map((f) => ({
    id: f.id,
    kind: 'file',
    title: f.path,
    subtitle: `${projectName(f.projectId)} · ${f.changeType}`,
    to: `/app/projects/${f.projectId}?task=${f.taskId ?? ''}&file=${f.id}`,
  }))
  const activity: SearchResult[] = MOCK_ACTIVITY.filter((e) => matchesQuery(query, e.title, e.description)).map((e) => ({
    id: e.id,
    kind: 'activity',
    title: e.title,
    subtitle: projectName(e.projectId),
    to: `/app/activity?event=${e.id}`,
  }))

  return [...projects, ...tasks, ...files, ...activity].slice(0, SEARCH_RESULT_LIMIT)
}

function sortedActivity(): ActivityEvent[] {
  return [...MOCK_ACTIVITY].sort(byNewest((event) => event.timestamp))
}

export const mockContinuumService: ContinuumService = {
  getOverview() {
    const activeTasks = MOCK_TASKS.filter(isActiveTask)
    const activeTaskIds = new Set(activeTasks.map((task) => task.id))
    return respond({
      projects: MOCK_PROJECTS.map(summarize),
      activeTaskCount: activeTasks.length,
      changedFileCount: MOCK_FILES.filter((file) => file.taskId !== undefined && activeTaskIds.has(file.taskId)).length,
      recentEvents: sortedActivity().slice(0, RECENT_EVENT_LIMIT),
      attention: buildAttention(),
    })
  },
  listProjects() {
    return respond(MOCK_PROJECTS.map(summarize))
  },
  listTasks() {
    return respond([...MOCK_TASKS])
  },
  getWorkspace(projectId) {
    try {
      return respond(buildWorkspace(projectId))
    } catch (error) {
      return Promise.reject(error)
    }
  },
  listActivity() {
    return respond(sortedActivity())
  },
  getMemoryGraph(projectId) {
    try {
      return respond(buildMemoryGraph(buildWorkspace(projectId)))
    } catch (error) {
      return Promise.reject(error)
    }
  },
  search(query) {
    return respond(searchAll(query))
  },
  updateTask() {
    return Promise.reject(new Error('The demo is read-only. Run `continuum serve` to edit your own tasks.'))
  },
  getBriefing(projectId) {
    try {
      const { project, tasks } = buildWorkspace(projectId)
      const task = tasks.find((candidate) => candidate.id === project.currentTaskId) ?? tasks[0]
      const lines = [`# Continuum handoff: ${project.name} (demo data)`, '', task ? `Current task: ${task.title}` : 'No current task.']
      if (task?.nextAction) lines.push(`Next action: ${task.nextAction}`)
      return respond(lines.join('\n'))
    } catch (error) {
      return Promise.reject(error)
    }
  },
}
