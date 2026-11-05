import { randomUUID } from 'node:crypto'
import { MAX_TASK_TEXT_CHARS, MAX_TITLE_CHARS, type NewTask, type RecordedCriterion, type TaskChange, type TaskField, type TaskUpsertedEvent } from '@continuum/core'
import type { ContextStore, GraphNode } from '@continuum/store'

export type TaskStatus = 'planned' | 'in-progress' | 'blocked' | 'completed'
const ACTIVE: ReadonlySet<string> = new Set(['in-progress', 'blocked'])
/** A task nobody has touched for this long is no longer "current": new work is not attributed to it. */
export const STALE_TASK_MS = 14 * 24 * 60 * 60 * 1000
const STATUSES: ReadonlySet<string> = new Set(['planned', 'in-progress', 'blocked', 'completed'])
const TASK_FIELDS: ReadonlySet<string> = new Set(['status', 'nextAction', 'steps', 'criteria', 'created'])

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task'
}

/** Titles that name the same task: case, spacing and punctuation aside. */
export const sameTitle = (a: string, b: string) => slug(a) === slug(b)

export const newTaskId = (title: string) => `${slug(title)}-${randomUUID().slice(0, 8)}`

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

export class InvalidTaskChangeError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'InvalidTaskChangeError'
  }
}

type TaskSnapshot = TaskUpsertedEvent['payload']

/** Every field of a task, since each task.upserted replaces the last. */
export function taskSnapshot(task: TaskSummary): TaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    ...(task.objective ? { objective: task.objective } : {}),
    ...(task.nextAction ? { nextAction: task.nextAction } : {}),
    acceptanceCriteria: task.acceptanceCriteria,
    completedSteps: task.completedSteps,
    remainingSteps: task.remainingSteps,
  }
}

/** Whether you made this task, for its label: what an agent says about a task is otherwise the agent's. */
export const isYourTask = (task: TaskSummary) => task.userEdited.includes('created')

function typed(value: string | undefined, name: string): string {
  const text = value?.trim() ?? ''
  if (text.length > MAX_TASK_TEXT_CHARS) throw new InvalidTaskChangeError(`The ${name} is longer than ${MAX_TASK_TEXT_CHARS} characters.`)
  return text
}

/** A task typed in the dashboard, and what starting it does to the others: as with start_task, tasks in progress are paused. */
export function createdTask(tasks: readonly TaskSummary[], input: NewTask): { task: TaskSnapshot; paused: TaskSnapshot[] } {
  // One line: a title is quoted into briefings, and a line break there could pose as a heading.
  const title = input.title.replace(/\s+/g, ' ').trim()
  if (title === '') throw new InvalidTaskChangeError('A task needs a title.')
  if (title.length > MAX_TITLE_CHARS) throw new InvalidTaskChangeError(`The title is longer than ${MAX_TITLE_CHARS} characters.`)
  const objective = typed(input.objective, 'objective')
  const nextAction = typed(input.nextAction, 'next action')
  if (tasks.some((task) => task.status !== 'completed' && sameTitle(task.title, title))) throw new InvalidTaskChangeError(`"${title}" is already an open task.`)
  return {
    task: {
      id: newTaskId(title),
      title,
      status: input.start ? 'in-progress' : 'planned',
      ...(objective ? { objective } : {}),
      ...(nextAction ? { nextAction } : {}),
      acceptanceCriteria: [],
      completedSteps: [],
      remainingSteps: [],
      editedFields: ['created'],
    },
    paused: input.start ? tasks.filter((task) => task.status === 'in-progress').map((task) => ({ ...taskSnapshot(task), status: 'planned', editedFields: ['status'] })) : [],
  }
}

/** The task snapshot after one dashboard edit. */
export function applyTaskChange(task: TaskSummary, change: TaskChange): TaskSnapshot {
  const base = taskSnapshot(task)
  switch (change.kind) {
    case 'status':
      if (!STATUSES.has(change.status)) throw new InvalidTaskChangeError(`Unknown status "${String(change.status)}".`)
      return { ...base, status: change.status, editedFields: ['status'] }
    case 'next-action': {
      const next = change.nextAction?.trim() ?? ''
      if (next.length > MAX_TASK_TEXT_CHARS) throw new InvalidTaskChangeError(`The next action is longer than ${MAX_TASK_TEXT_CHARS} characters.`)
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
