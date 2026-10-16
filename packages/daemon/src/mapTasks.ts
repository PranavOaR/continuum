import type { ProjectTask } from '@continuum/core'
import type { TaskSummary } from '@continuum/context'
import { ids } from './ids'
import { toFiles } from './mapProject'
import type { RepoSnapshot } from './snapshot'

const CRITERION_EVIDENCE = {
  'agent-reported': 'Reported by the agent through update_task; not verified.',
  'user-reported': 'Set by you in the dashboard; not verified.',
} as const

function checksCovering(snapshot: RepoSnapshot, files: readonly string[]): string[] {
  const keys = files.map((path) => `file:${path}`)
  return snapshot.state.checks
    .filter((check) => keys.some((key) => key in (snapshot.checkCoverage.get(check.name) ?? {})))
    .map((check) => ids.check(snapshot.projectId, check.name))
}

export function toTask(snapshot: RepoSnapshot, task: TaskSummary): ProjectTask {
  // Only files the dashboard lists (changed, within the cap) can be linked.
  const listed = new Set(toFiles(snapshot).map((file) => file.path))
  const files = task.files.filter((path) => listed.has(path))
  return {
    id: task.id,
    projectId: snapshot.projectId,
    title: task.title,
    description: task.objective ?? '',
    objective: task.objective ?? 'No objective recorded.',
    status: task.status,
    acceptanceCriteria: task.acceptanceCriteria.map((criterion, index) => ({
      id: `${task.id}~criterion~${index}`,
      text: criterion.text,
      status: criterion.met ? 'complete' : 'incomplete',
      evidence: CRITERION_EVIDENCE[task.reportedBy],
    })),
    completedSteps: task.completedSteps,
    remainingSteps: task.remainingSteps,
    ...(task.nextAction ? { nextAction: task.nextAction } : {}),
    relatedFileIds: files.map((path) => ids.file(snapshot.projectId, path)),
    verificationIds: checksCovering(snapshot, files),
    updatedAt: task.updatedAt,
    reportedBy: task.reportedBy,
  }
}

const tasksCache = new WeakMap<RepoSnapshot, ProjectTask[]>()

export function toTasks(snapshot: RepoSnapshot): ProjectTask[] {
  const cached = tasksCache.get(snapshot)
  if (cached) return cached
  const tasks = snapshot.state.tasks.map((task) => toTask(snapshot, task))
  tasksCache.set(snapshot, tasks)
  return tasks
}

export function currentTask(snapshot: RepoSnapshot): ProjectTask | undefined {
  return toTasks(snapshot).find((task) => task.id === snapshot.state.currentTaskId)
}
