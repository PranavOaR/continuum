import type { AgentSession, MemoryRecord, VerificationRecord } from '@continuum/core'
import type { CheckSummary } from '@continuum/context'
import { asAgent, ids } from './ids'
import type { RepoSnapshot } from './snapshot'

const MAX_LISTED = 5

function list(paths: readonly string[]): string {
  const shown = paths.slice(0, MAX_LISTED).join(', ')
  return paths.length > MAX_LISTED ? `${shown} and ${paths.length - MAX_LISTED} more` : shown
}

function checkDetail(check: CheckSummary, coverage: number): string {
  switch (check.status) {
    case 'out-of-date':
      return `Changed since it ran: ${list(check.changed)}. Re-run to verify the current code.`
    case 'failed':
      return `Exited ${check.exitCode ?? '?'} against ${coverage} files.`
    case 'passed':
      return `Exited 0 against the current content of all ${coverage} files it covered.`
    default:
      return 'No usable run recorded.'
  }
}

export function toVerification(snapshot: RepoSnapshot): VerificationRecord[] {
  return snapshot.state.checks.map((check) => ({
    id: ids.check(snapshot.projectId, check.name),
    projectId: snapshot.projectId,
    name: check.name,
    command: check.command,
    status: check.status,
    evidenceType: check.evidence,
    ...(check.ranAt ? { lastRunAt: check.ranAt } : {}),
    detail: checkDetail(check, Object.keys(snapshot.checkCoverage.get(check.name) ?? {}).length),
  }))
}

export function toMemory(snapshot: RepoSnapshot): MemoryRecord[] {
  const taskOf = new Map(snapshot.edges.filter((edge) => edge.type === 'informs').map((edge) => [edge.from, edge.to.slice('task:'.length)]))
  return snapshot.state.decisions.map((decision) => {
    const taskId = taskOf.get(`memory:${decision.id}`)
    const node = snapshot.nodeByKey.get(`memory:${decision.id}`)
    const anchors = Object.keys((node?.props.anchors ?? {}) as Record<string, string>).map((key) => key.slice('file:'.length))
    const stale = decision.status === 'anchor-changed' ? ` Anchored code changed since: ${list(decision.changed)}.` : ''
    return {
      id: ids.memory(snapshot.projectId, decision.id),
      projectId: snapshot.projectId,
      kind: decision.kind,
      title: decision.title,
      body: decision.body,
      source: 'agent-summary',
      sourceDetail: `Recorded by an agent through Continuum.${stale}`,
      evidenceType: decision.evidence,
      relatedFileIds: anchors.map((path) => ids.file(snapshot.projectId, path)),
      createdAt: decision.recordedAt,
      ...(taskId ? { taskId } : {}),
    }
  })
}

export function toSessions(snapshot: RepoSnapshot): AgentSession[] {
  return snapshot.state.sessions.map((session) => ({
    id: ids.session(snapshot.projectId, session.id),
    projectId: snapshot.projectId,
    agent: asAgent(session.agent),
    startedAt: session.startedAt ?? session.lastActivityAt ?? '',
    endedAt: session.lastActivityAt ?? session.startedAt ?? '',
    summary: session.note ?? (session.ended ? 'Session ended without a note.' : 'Session in progress.'),
    evidenceType: session.note ? 'agent-reported' : 'observed',
  }))
}
