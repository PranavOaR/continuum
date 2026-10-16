import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { redactSecrets } from '@continuum/capture'
import { currentTaskNode, summarizeTask, type TaskSummary } from '@continuum/context'
import type { TaskUpsertedEvent } from '@continuum/core'
import type { ContextStore } from '@continuum/store'

const MAX_ITEMS = 30
const MAX_TEXT = 500
const item = z.string().trim().min(1).max(MAX_TEXT)
const items = z.array(item).max(MAX_ITEMS)

export class TaskToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaskToolError'
  }
}

type Snapshot = TaskUpsertedEvent['payload']

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task'
}

const clean = (value: string) => redactSecrets(value.trim())

function snapshotOf(task: TaskSummary): Snapshot {
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

function event(payload: Snapshot, now: Date): TaskUpsertedEvent {
  return { type: 'task.upserted', payload, evidence: 'agent-reported', source: 'mcp', occurredAt: now.toISOString() }
}

export const startTaskInput = {
  title: item.max(200).describe('Short name of the task, e.g. "Add Google sign-in"'),
  objective: z.string().trim().max(MAX_TEXT).optional().describe('What done looks like, in one or two sentences'),
  acceptance_criteria: items.default([]).describe('Checkable conditions for done'),
  steps: items.default([]).describe('Planned steps, in order'),
}

export const updateTaskInput = {
  task_id: z.string().min(1).optional().describe('Defaults to the current task'),
  status: z.enum(['planned', 'in-progress', 'blocked', 'completed']).optional(),
  next_action: z.string().trim().max(MAX_TEXT).optional().describe('The single next thing to do; an empty string clears it'),
  completed_steps: items.default([]).describe('Steps just finished; removed from the remaining steps if listed there'),
  remaining_steps: items.optional().describe('Replaces the remaining steps'),
  criteria_met: items.default([]).describe('Acceptance criteria (exact text) that are now met'),
}

type StartInput = z.infer<z.ZodObject<typeof startTaskInput>>
type UpdateInput = z.infer<z.ZodObject<typeof updateTaskInput>>

/** Creates a task and makes it current (in progress). */
export function startTask(store: ContextStore, input: StartInput, now: Date): Snapshot {
  const title = clean(input.title)
  const payload: Snapshot = {
    id: `${slug(title)}-${randomUUID().slice(0, 8)}`,
    title,
    status: 'in-progress',
    ...(input.objective ? { objective: clean(input.objective) } : {}),
    acceptanceCriteria: input.acceptance_criteria.map((text) => ({ text: clean(text), met: false })),
    completedSteps: [],
    remainingSteps: input.steps.map(clean),
  }
  store.transact(() => [event(payload, now)])
  return payload
}

/** Applies a partial update to a task as one new snapshot, read and written under the store lock. */
export function updateTask(store: ContextStore, input: UpdateInput, now: Date): Snapshot {
  let next: Snapshot | undefined
  store.transact(() => {
    const node = input.task_id ? store.graph.get(`task:${input.task_id}`) : currentTaskNode(store)
    if (!node || node.kind !== 'task') {
      throw new TaskToolError(input.task_id ? `No task "${input.task_id}".` : 'No current task. Start one with start_task first.')
    }
    const current = snapshotOf(summarizeTask(store, node))
    const done = input.completed_steps.map(clean)
    const metTexts = input.criteria_met.map(clean)
    const criteria = current.acceptanceCriteria ?? []
    const unknown = metTexts.filter((text) => !criteria.some((criterion) => criterion.text === text))
    if (unknown.length > 0) throw new TaskToolError(`Unknown acceptance criteria: ${unknown.join('; ')}. Use the exact text.`)
    const remaining = input.remaining_steps ? input.remaining_steps.map(clean) : (current.remainingSteps ?? [])
    const nextAction = input.next_action === undefined ? current.nextAction : clean(input.next_action) || undefined
    const { nextAction: _previous, ...rest } = current
    next = {
      ...rest,
      ...(input.status ? { status: input.status } : {}),
      ...(nextAction ? { nextAction } : {}),
      acceptanceCriteria: criteria.map((criterion) => (metTexts.includes(criterion.text) ? { ...criterion, met: true } : criterion)),
      completedSteps: [...(current.completedSteps ?? []), ...done.filter((step) => !(current.completedSteps ?? []).includes(step))],
      remainingSteps: remaining.filter((step) => !done.includes(step)),
    }
    return [event(next, now)]
  })
  return next as Snapshot
}

function describe(snapshot: Snapshot): string {
  const criteria = snapshot.acceptanceCriteria ?? []
  const met = criteria.filter((criterion) => criterion.met).length
  return [
    `Task ${snapshot.id}: "${snapshot.title}" is ${snapshot.status}.`,
    criteria.length > 0 ? `${met}/${criteria.length} acceptance criteria met.` : '',
    `${(snapshot.remainingSteps ?? []).length} step(s) remaining.`,
    snapshot.nextAction ? `Next: ${snapshot.nextAction}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

type Run = (work: (store: ContextStore) => Promise<string> | string) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>

/** Lets an agent record what it is working on, so the next session (or agent) continues the same task. */
export function registerTaskTools(server: McpServer, run: Run, now: () => Date): void {
  server.registerTool(
    'start_task',
    {
      title: 'Start task',
      description:
        'Record the task you are starting (or switching to) so later sessions and other agents continue it. Call this when you begin a distinct piece of work; it becomes the current task, and file edits are attributed to it.',
      inputSchema: startTaskInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => run((store) => `Started. ${describe(startTask(store, input, now()))}`),
  )
  server.registerTool(
    'update_task',
    {
      title: 'Update task',
      description:
        'Update the current task (or task_id): status, next action, steps finished, remaining steps, acceptance criteria met. Call it when you finish a step, get blocked, or stop working, so the next session knows exactly where things stand.',
      inputSchema: updateTaskInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => run((store) => `Updated. ${describe(updateTask(store, input, now()))}`),
  )
}
