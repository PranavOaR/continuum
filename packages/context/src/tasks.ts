import type { RecordedCriterion, TaskChange, TaskField, TaskUpsertedEvent } from '@continuum/core'
import type { ContextStore, GraphNode } from '@continuum/store'

export type TaskStatus = 'planned' | 'in-progress' | 'blocked' | 'completed'
const ACTIVE: ReadonlySet<string> = new Set(['in-progress', 'blocked'])
/** A task nobody has touched for this long is no longer "current": new work is not attributed to it. */
export const STALE_TASK_MS = 14 * 24 * 60 * 60 * 1000
const STATUSES: ReadonlySet<string> = new Set(['planned', 'in-progress', 'blocked', 'completed'])
const TASK_FIELDS: ReadonlySet<string> = new Set(['status', 'nextAction', 'steps', 'criteria'])

/** Removes one occurrence, so two steps that happen to share a name stay two steps. */
function withoutOne(steps: readonly string[], step: string): string[] {
  const index = steps.indexOf(step)
  return index === -1 ? [...steps] : [...steps.slice(0, index), ...steps.slice(index + 1)]
}

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
  /** Fields you changed in the dashboard since the agent last reported the task. */
  userEdited: TaskField[]
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
    userEdited: strings(node.props.userEdited).filter((field): field is TaskField => TASK_FIELDS.has(field)),
  }
}

/** Longest next action accepted from the dashboard; agents are held to the same limit through MCP. */
export const MAX_NEXT_ACTION_CHARS = 500

export class InvalidTaskChangeError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'InvalidTaskChangeError'
  }
}

/** The task snapshot after one dashboard edit: every field, since each task.upserted replaces the last. */
export function applyTaskChange(task: TaskSummary, change: TaskChange): TaskUpsertedEvent['payload'] {
  const base: TaskUpsertedEvent['payload'] = {
    id: task.id,
    title: task.title,
    status: task.status,
    ...(task.objective ? { objective: task.objective } : {}),
    ...(task.nextAction ? { nextAction: task.nextAction } : {}),
    acceptanceCriteria: task.acceptanceCriteria,
    completedSteps: task.completedSteps,
    remainingSteps: task.remainingSteps,
  }
  switch (change.kind) {
    case 'status':
      if (!STATUSES.has(change.status)) throw new InvalidTaskChangeError(`Unknown status "${String(change.status)}".`)
      return { ...base, status: change.status, editedFields: ['status'] }
    case 'next-action': {
      const next = change.nextAction?.trim() ?? ''
      if (next.length > MAX_NEXT_ACTION_CHARS) throw new InvalidTaskChangeError(`The next action is longer than ${MAX_NEXT_ACTION_CHARS} characters.`)
      const { nextAction: _previous, ...rest } = base
      return next === '' ? { ...rest, editedFields: ['nextAction'] } : { ...rest, nextAction: next, editedFields: ['nextAction'] }
    }
    case 'step': {
      // Move one step between the lists; asking for the state it is already in changes nothing.
      const from = change.done ? task.remainingSteps : task.completedSteps
      if (!from.includes(change.step)) {
        const known = task.completedSteps.includes(change.step) || task.remainingSteps.includes(change.step)
        if (!known) throw new InvalidTaskChangeError(`"${change.step}" is not a step of this task.`)
        return { ...base, editedFields: ['steps'] }
      }
      return change.done
        ? { ...base, completedSteps: [...task.completedSteps, change.step], remainingSteps: withoutOne(task.remainingSteps, change.step), editedFields: ['steps'] }
        : { ...base, completedSteps: withoutOne(task.completedSteps, change.step), remainingSteps: [...task.remainingSteps, change.step], editedFields: ['steps'] }
    }
    case 'criterion': {
      const target = Number.isInteger(change.index) ? task.acceptanceCriteria[change.index] : undefined
      if (!target) throw new InvalidTaskChangeError('No such acceptance criterion.')
      if (target.text !== change.text) throw new InvalidTaskChangeError('The acceptance criteria changed since the page loaded; reload and try again.')
      return {
        ...base,
        acceptanceCriteria: task.acceptanceCriteria.map((criterion, index) => (index === change.index ? { ...criterion, met: change.met } : criterion)),
        editedFields: ['criteria'],
      }
    }
  }
}

/** Every task, most recently updated first. */
export function taskSummaries(store: ContextStore): TaskSummary[] {
  return taskNodes(store)
    .sort(newestFirst)
    .map((node) => summarizeTask(store, node))
}
