import type { RecordedCriterion } from '@continuum/core'
import type { ContextStore, GraphNode } from '@continuum/store'

export type TaskStatus = 'planned' | 'in-progress' | 'blocked' | 'completed'
const ACTIVE: ReadonlySet<string> = new Set(['in-progress', 'blocked'])
/** A task nobody has touched for this long is no longer "current": new work is not attributed to it. */
export const STALE_TASK_MS = 14 * 24 * 60 * 60 * 1000
const STATUSES: ReadonlySet<string> = new Set(['planned', 'in-progress', 'blocked', 'completed'])

export interface TaskSummary {
  id: string
  title: string
  status: TaskStatus
  objective: string | null
  nextAction: string | null
  acceptanceCriteria: RecordedCriterion[]
  completedSteps: string[]
  remainingSteps: string[]
  /** Repository-relative paths edited while this task was current. */
  files: string[]
  updatedAt: string
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

function criteria(value: unknown): RecordedCriterion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) =>
    typeof item === 'object' && item !== null && typeof (item as RecordedCriterion).text === 'string'
      ? [{ text: (item as RecordedCriterion).text, met: (item as RecordedCriterion).met === true }]
      : [],
  )
}

/** Recorded tasks only: placeholder nodes created by references have no title. */
function taskNodes(store: ContextStore): GraphNode[] {
  return store.graph
    .keysOfKind('task')
    .map((key) => store.graph.get(key))
    .filter((node): node is GraphNode => node !== undefined && typeof node.props.title === 'string')
}

/** Newest first, with the key as tie-break so live and restored graphs agree. */
const newestFirst = (a: GraphNode, b: GraphNode) => b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key)

export function isTaskNode(node: GraphNode | undefined): node is GraphNode {
  return node !== undefined && node.kind === 'task' && typeof node.props.title === 'string'
}

/**
 * The task being worked on: the most recently updated one that is in progress
 * or blocked, unless it has gone untouched for STALE_TASK_MS.
 */
export function currentTaskNode(store: ContextStore, now: Date = new Date()): GraphNode | undefined {
  const [latest] = taskNodes(store)
    .filter((node) => ACTIVE.has(String(node.props.status)))
    .sort(newestFirst)
  if (!latest || now.getTime() - Date.parse(latest.updatedAt) > STALE_TASK_MS) return undefined
  return latest
}

export function currentTaskId(store: ContextStore, now?: Date): string | undefined {
  return currentTaskNode(store, now)?.key.slice('task:'.length)
}

export function summarizeTask(store: ContextStore, node: GraphNode): TaskSummary {
  const status = String(node.props.status)
  return {
    id: node.key.slice('task:'.length),
    title: text(node.props.title) ?? '(untitled task)',
    status: (STATUSES.has(status) ? status : 'planned') as TaskStatus,
    objective: text(node.props.objective),
    nextAction: text(node.props.nextAction),
    acceptanceCriteria: criteria(node.props.acceptanceCriteria),
    completedSteps: strings(node.props.completedSteps),
    remainingSteps: strings(node.props.remainingSteps),
    files: store.graph
      .neighbors(node.key, { direction: 'out', types: ['touches'] })
      .map((key) => key.slice('file:'.length))
      .sort(),
    updatedAt: node.updatedAt,
  }
}

/** Every task, most recently updated first. */
export function taskSummaries(store: ContextStore): TaskSummary[] {
  return taskNodes(store)
    .sort(newestFirst)
    .map((node) => summarizeTask(store, node))
}
