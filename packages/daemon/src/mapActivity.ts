import { getAgent, type ActivityEvent, type ContinuumEvent } from '@continuum/core'
import { asAgent, ids } from './ids'
import type { RepoSnapshot } from './snapshot'

const MAX_DESCRIPTION_CHARS = 280

function clip(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_DESCRIPTION_CHARS ? `${flat.slice(0, MAX_DESCRIPTION_CHARS - 1)}…` : flat
}

function sessionAgent(snapshot: RepoSnapshot, sessionId: string | undefined) {
  if (!sessionId) return undefined
  return asAgent(snapshot.nodeByKey.get(`session:${sessionId}`)?.props.agent)
}

function isBaseline(snapshot: RepoSnapshot, event: ContinuumEvent): boolean {
  return event.type === 'file.changed' && event.source === 'watcher:git' && event.occurredAt === snapshot.baselineAt
}

type Described = Pick<ActivityEvent, 'type' | 'title' | 'description'> & Partial<Pick<ActivityEvent, 'agent' | 'fileId' | 'taskId'>>

function sessionTask(snapshot: RepoSnapshot, sessionId: string): string | undefined {
  const taskId = snapshot.nodeByKey.get(`session:${sessionId}`)?.props.taskId
  return typeof taskId === 'string' ? taskId : undefined
}

const withTask = (taskId: string | undefined) => (taskId ? { taskId } : {})

function describe(snapshot: RepoSnapshot, event: ContinuumEvent): Described {
  switch (event.type) {
    case 'file.changed': {
      const agent = sessionAgent(snapshot, event.payload.sessionId)
      return {
        type: 'file-change',
        title: `${event.payload.changeType === 'added' ? 'Added' : event.payload.changeType === 'deleted' ? 'Deleted' : 'Modified'} ${event.payload.path}`,
        description: agent ? `Edited by ${getAgent(agent).name}.` : 'Captured from the working tree.',
        fileId: ids.file(snapshot.projectId, event.payload.path),
        ...(agent ? { agent } : {}),
        ...withTask(event.payload.taskId),
      }
    }
    case 'check.recorded': {
      const { name, command, exitCode, durationMs } = event.payload
      return {
        type: 'test-result',
        title: `${name} ${exitCode === 0 ? 'passed' : 'failed'}`,
        description: `${event.evidence === 'verified' ? '' : 'Run by an agent: '}\`${command}\` exited ${exitCode}${durationMs > 0 ? ` after ${(durationMs / 1000).toFixed(1)}s` : ''}.`,
      }
    }
    case 'memory.recorded':
      return { type: 'decision', title: event.payload.title, description: clip(event.payload.body) || 'Recorded by an agent.', ...withTask(event.payload.taskId) }
    case 'session.started': {
      const agent = asAgent(event.payload.agent)
      return { type: 'session', title: `${getAgent(agent).name} session started`, description: 'A new agent session began.', agent, ...withTask(event.payload.taskId) }
    }
    case 'session.progress': {
      const agent = sessionAgent(snapshot, event.payload.sessionId)
      return { type: 'session', title: 'Progress note', description: clip(event.payload.note), ...(agent ? { agent } : {}), ...withTask(sessionTask(snapshot, event.payload.sessionId)) }
    }
    case 'session.ended': {
      const agent = sessionAgent(snapshot, event.payload.sessionId)
      return {
        type: 'session',
        title: 'Session ended',
        description: clip(event.payload.summary ?? '') || 'The agent session ended.',
        ...(agent ? { agent } : {}),
        ...withTask(sessionTask(snapshot, event.payload.sessionId)),
      }
    }
    case 'session.task': {
      const agent = sessionAgent(snapshot, event.payload.sessionId)
      return { type: 'session', title: 'Session took up a task', description: 'Edits in this session are attributed to this task.', ...(agent ? { agent } : {}), taskId: event.payload.taskId }
    }
    case 'session.prompted': {
      const agent = sessionAgent(snapshot, event.payload.sessionId)
      return { type: 'session', title: 'You asked', description: clip(event.payload.prompt), ...(agent ? { agent } : {}), ...withTask(sessionTask(snapshot, event.payload.sessionId)) }
    }
    case 'task.upserted':
      return {
        type: 'task-update',
        title: event.payload.title,
        description: event.payload.nextAction ? `Task is ${event.payload.status.replace('-', ' ')}. Next: ${clip(event.payload.nextAction)}` : `Task is ${event.payload.status.replace('-', ' ')}.`,
        taskId: event.payload.id,
      }
  }
}

const activityCache = new WeakMap<RepoSnapshot, ActivityEvent[]>()

/** Recorded work, newest first. The first scan's import of existing files is left out. */
export function toActivity(snapshot: RepoSnapshot): ActivityEvent[] {
  const cached = activityCache.get(snapshot)
  if (cached) return cached
  const activity = snapshot.events
    .filter(({ event }) => !isBaseline(snapshot, event))
    .map(({ seq, event }) => ({
      id: ids.event(snapshot.projectId, seq),
      projectId: snapshot.projectId,
      evidenceType: event.evidence,
      timestamp: event.occurredAt,
      ...describe(snapshot, event),
    }))
  activityCache.set(snapshot, activity)
  return activity
}
