import { SCAN_SOURCE } from '@continuum/capture'
import type { ContinuumEvent, EvidenceType, TaskField } from '@continuum/core'
import type { ContextStore, GraphNode } from '@continuum/store'

/** Events looked at; older history is summarized by the rest of the handoff. */
const LOOKBACK_EVENTS = 2_000

export interface SinceYouLeft {
  /** When this agent's previous session was last active. */
  since: string
  /** Each item says when it last happened, so an agent never has to guess from the section's start. */
  otherSessions: { sessionId: string; agent: string; files: string[]; note: string | null; at: string }[]
  /** Changes no agent session made: by hand, or a tool Continuum does not see. */
  outsideChanges: string[]
  outsideChangedAt: string | null
  /** The latest result of each check run since, with how it was recorded. */
  checks: { name: string; passed: boolean; evidence: EvidenceType; at: string }[]
  commits: { hash: string; message: string; at: string }[]
  decisions: { title: string; at: string }[]
  /** Tasks you changed in the dashboard, and which parts. */
  taskEdits: { taskId: string; title: string; fields: TaskField[]; at: string }[]
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

function lastActive(node: GraphNode): string {
  return text(node.props.lastActivityAt) ?? text(node.props.endedAt) ?? text(node.props.startedAt) ?? node.updatedAt
}

/** The agent's most recent session other than the current one. */
function previousSession(store: ContextStore, agent: string, currentSessionId: string): GraphNode | undefined {
  return store.graph
    .keysOfKind('session')
    .map((key) => store.graph.get(key) as GraphNode)
    .filter((node) => node.key !== `session:${currentSessionId}` && node.props.agent === agent)
    .sort((a, b) => lastActive(b).localeCompare(lastActive(a)))[0]
}

function addUnique<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list : [...list, value]
}

/** Folds one event into the summary; unrelated event types leave it unchanged. */
function fold(summary: SinceYouLeft, event: ContinuumEvent, sessionAgent: (sessionId: string) => string, currentSessionId: string): SinceYouLeft {
  switch (event.type) {
    case 'file.changed': {
      const { sessionId, path } = event.payload
      if (sessionId === currentSessionId) return summary
      if (!sessionId) {
        return event.source === SCAN_SOURCE ? { ...summary, outsideChanges: addUnique(summary.outsideChanges, path), outsideChangedAt: event.occurredAt } : summary
      }
      const existing = summary.otherSessions.find((session) => session.sessionId === sessionId)
      const others = summary.otherSessions.filter((session) => session.sessionId !== sessionId)
      const session = existing ?? { sessionId, agent: sessionAgent(sessionId), files: [], note: null, at: event.occurredAt }
      return { ...summary, otherSessions: [...others, { ...session, files: addUnique(session.files, path), at: event.occurredAt }] }
    }
    case 'session.progress':
    case 'session.ended': {
      const { sessionId } = event.payload
      const note = event.type === 'session.progress' ? event.payload.note : (event.payload.summary ?? null)
      if (sessionId === currentSessionId || !note) return summary
      const existing = summary.otherSessions.find((session) => session.sessionId === sessionId)
      const others = summary.otherSessions.filter((session) => session.sessionId !== sessionId)
      return { ...summary, otherSessions: [...others, { ...(existing ?? { sessionId, agent: sessionAgent(sessionId), files: [] }), note, at: event.occurredAt }] }
    }
    case 'check.recorded': {
      const checks = summary.checks.filter((check) => check.name !== event.payload.name)
      return { ...summary, checks: [...checks, { name: event.payload.name, passed: event.payload.exitCode === 0, evidence: event.evidence, at: event.occurredAt }] }
    }
    case 'commit.recorded':
      return event.payload.baseline ? summary : { ...summary, commits: [...summary.commits, { hash: event.payload.hash, message: event.payload.message, at: event.occurredAt }] }
    case 'memory.recorded': {
      const decisions = summary.decisions.filter((decision) => decision.title !== event.payload.title)
      return { ...summary, decisions: [...decisions, { title: event.payload.title, at: event.occurredAt }] }
    }
    case 'task.upserted': {
      if (event.evidence !== 'user-reported') return summary
      const existing = summary.taskEdits.find((edit) => edit.taskId === event.payload.id)
      const fields = [...new Set([...(existing?.fields ?? []), ...(event.payload.editedFields ?? [])])]
      const others = summary.taskEdits.filter((edit) => edit.taskId !== event.payload.id)
      return { ...summary, taskEdits: [...others, { taskId: event.payload.id, title: event.payload.title, fields, at: event.occurredAt }] }
    }
    default:
      return summary
  }
}

/**
 * What happened while this agent was away: since its previous session was
 * last active, until the current session began. Null for an agent's first
 * session here, when there is nothing to compare with.
 */
export function sinceYouLeft(store: ContextStore, agent: string, currentSessionId: string): SinceYouLeft | null {
  const previous = previousSession(store, agent, currentSessionId)
  if (!previous) return null
  const since = lastActive(previous)
  const sessionAgent = (sessionId: string) => text(store.graph.get(`session:${sessionId}`)?.props.agent) ?? 'unknown'
  const events = store
    .recentEvents(LOOKBACK_EVENTS)
    .map((entry) => entry.event)
    .filter((event) => event.occurredAt > since)
    .reverse()
  const empty: SinceYouLeft = { since, otherSessions: [], outsideChanges: [], outsideChangedAt: null, checks: [], commits: [], decisions: [], taskEdits: [] }
  return events.reduce((summary, event) => fold(summary, event, sessionAgent, currentSessionId), empty)
}

export function isQuiet(summary: SinceYouLeft): boolean {
  return [summary.otherSessions, summary.outsideChanges, summary.checks, summary.commits, summary.decisions, summary.taskEdits].every((items) => items.length === 0)
}
