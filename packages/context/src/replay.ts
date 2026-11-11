import { getAgent, type AgentType, type ContentHash, type ContinuumEvent, type ReplayStep, type TaskReplay } from '@continuum/core'

/**
 * A task's history, told from the event log alone: the sessions that worked
 * on it, every change to its files (its own, another agent's, a person's),
 * the checks that ran against them, its decisions, and the moment each
 * passing check went out of date. Events must be self-contained (a check's
 * coverage inline), as `ContextStore.selfContained` gives them. It ends when
 * the task is completed.
 */
type TaskPayload = Extract<ContinuumEvent, { type: 'task.upserted' }>['payload']

const FILE_PREFIX = 'file:'
const KNOWN_AGENTS = new Set<string>(['claude-code', 'codex', 'cursor', 'vscode', 'antigravity', 'chatgpt'])
const agentName = (agent: string | undefined) => (agent && KNOWN_AGENTS.has(agent) ? getAgent(agent as AgentType).name : agent ? `A ${agent}` : 'An agent')

/** Covered files and their hashes for one run of a check. */
const coverageOf = (event: Extract<ContinuumEvent, { type: 'check.recorded' }>) =>
  new Map(Object.entries((event.payload.ranAgainst ?? {}) as Record<string, ContentHash>).flatMap(([key, hash]) => (key.startsWith(FILE_PREFIX) ? [[key.slice(FILE_PREFIX.length), hash] as const] : [])))

function taskSteps(previous: TaskPayload | undefined, task: TaskPayload, step: Omit<ReplayStep, 'kind' | 'title' | 'detail'>): ReplayStep[] {
  if (!previous) return [{ ...step, kind: 'task', title: `Task ${task.status === 'planned' ? 'planned' : 'started'}: ${task.title}`, detail: task.nextAction ? `Next: ${task.nextAction}` : '' }]
  const done = (task.completedSteps ?? []).filter((item) => !(previous.completedSteps ?? []).includes(item))
  const steps: ReplayStep[] = done.map((item) => ({ ...step, kind: 'task', title: `Step done: ${item}`, detail: '' }))
  if (task.status !== previous.status) {
    steps.push({ ...step, kind: 'task', title: task.status === 'completed' ? 'Task completed' : `Status: ${task.status.replace('-', ' ')}`, detail: task.nextAction ? `Next: ${task.nextAction}` : '' })
  } else if (task.nextAction && task.nextAction !== previous.nextAction) {
    steps.push({ ...step, kind: 'task', title: 'Next step set', detail: task.nextAction })
  }
  return steps
}

export function taskReplay(events: readonly ContinuumEvent[], taskId: string): TaskReplay {
  const agents = new Map<string, string>()
  const linked = new Set<string>()
  const files = new Set<string>()
  /** Passing checks that cover task files, and what they ran against. */
  const holding = new Map<string, Map<string, ContentHash>>()
  const steps: ReplayStep[] = []
  let task: TaskPayload | undefined
  let started = false
  const add = (step: ReplayStep) => steps.push(step)

  for (const event of events) {
    const base = { at: event.occurredAt, evidence: event.evidence }
    if (event.type === 'session.started') agents.set(event.payload.sessionId, event.payload.agent)
    if (event.type === 'session.started' && event.payload.taskId === taskId && !event.payload.resumed) {
      started = true
      linked.add(event.payload.sessionId)
      add({ ...base, kind: 'session', title: `${agentName(event.payload.agent)} session started`, detail: '', agent: event.payload.agent })
      continue
    }
    if (event.type === 'task.upserted' && event.payload.id === taskId) {
      started = true
      for (const step of taskSteps(task, event.payload, base)) add(step)
      task = event.payload
      if (task.status === 'completed') break
      continue
    }
    if (!started) continue
    switch (event.type) {
      case 'session.started':
        if (event.payload.resumed && linked.has(event.payload.sessionId)) add({ ...base, kind: 'session', title: `${agentName(event.payload.agent)} session resumed`, detail: '', agent: event.payload.agent })
        break
      case 'session.task':
        if (event.payload.taskId === taskId && !linked.has(event.payload.sessionId)) {
          linked.add(event.payload.sessionId)
          const agent = agents.get(event.payload.sessionId)
          add({ ...base, kind: 'session', title: `${agentName(agent)} session took up the task`, detail: '', ...(agent ? { agent } : {}) })
        }
        break
      case 'session.progress':
      case 'session.ended': {
        if (!linked.has(event.payload.sessionId)) break
        const agent = agents.get(event.payload.sessionId)
        const note = event.type === 'session.progress' ? event.payload.note : (event.payload.summary ?? '')
        add({ ...base, kind: 'note', title: `${agentName(agent)} ${event.type === 'session.ended' ? 'session ended' : 'left a note'}`, detail: note, ...(agent ? { agent } : {}) })
        break
      }
      case 'file.changed': {
        const { path, contentHash, sessionId } = event.payload
        const ours = event.payload.taskId === taskId
        if (!ours && !files.has(path)) break
        if (ours) files.add(path)
        const agent = sessionId ? agents.get(sessionId) : undefined
        // An edit to one of this task's files by a session working on something else, or by hand, matters to this task too.
        const title = !sessionId ? `${path} changed outside an agent session` : ours ? `${agentName(agent)} edited ${path}` : `${agentName(agent)} edited ${path} for another task`
        add({ ...base, kind: 'edit', title, detail: event.payload.changeType === 'modified' ? '' : event.payload.changeType, ...(agent ? { agent } : {}) })
        for (const [name, covered] of holding) {
          if (covered.has(path) && covered.get(path) !== contentHash) {
            add({ ...base, kind: 'stale', title: `${name} went out of date`, detail: `It passed against ${path}, which has changed since.`, tone: 'warn' })
            holding.delete(name)
          }
        }
        break
      }
      case 'check.recorded': {
        const covered = coverageOf(event)
        if (![...covered.keys()].some((path) => files.has(path))) break
        const passed = event.payload.exitCode === 0
        add({ ...base, kind: 'check', title: `${event.payload.name} ${passed ? 'passed' : 'failed'}`, detail: `\`${event.payload.command}\``, tone: passed ? 'good' : 'bad' })
        if (passed) holding.set(event.payload.name, covered)
        else holding.delete(event.payload.name)
        break
      }
      case 'memory.recorded':
        if (event.payload.taskId === taskId) {
          const verb = event.payload.review === 'resolved' ? 'Resolved' : event.payload.review === 'still-valid' ? 'Confirmed still valid' : `${event.payload.kind === 'decision' ? 'Decision' : 'Note'} recorded`
          add({ ...base, kind: 'decision', title: `${verb}: ${event.payload.title}`, detail: event.payload.body })
        }
        break
      default:
        break
    }
  }

  const agentsInvolved = [...new Set(steps.flatMap((step) => (step.agent ? [step.agent] : [])))]
  return {
    taskId,
    title: task?.title ?? '',
    status: task?.status ?? 'unknown',
    steps,
    summary: {
      agents: agentsInvolved,
      edits: steps.filter((step) => step.kind === 'edit').length,
      checks: steps.filter((step) => step.kind === 'check').length,
      stale: steps.filter((step) => step.kind === 'stale').length,
      decisions: steps.filter((step) => step.kind === 'decision').length,
    },
  }
}
