import type { RecordedCriterion } from '@continuum/core'
import type { ContextStore, GraphNode } from '@continuum/store'

export type TaskStatus = 'planned' | 'in-progress' | 'blocked' | 'completed'
const ACTIVE: ReadonlySet<string> = new Set(['in-progress', 'blocked'])
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

function taskNodes(store: ContextStore): GraphNode[] {
  return store.graph
    .keysOfKind('task')
    .map((key) => store.graph.get(key))
    .filter((node): node is GraphNode => node !== undefined)
}

/** The task being worked on: the most recently updated one that is in progress or blocked. */
export function currentTaskNode(store: ContextStore): GraphNode | undefined {
  return taskNodes(store)
    .filter((node) => ACTIVE.has(String(node.props.status)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

export function currentTaskId(store: ContextStore): string | undefined {
  return currentTaskNode(store)?.key.slice('task:'.length)
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
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((node) => summarizeTask(store, node))
}
