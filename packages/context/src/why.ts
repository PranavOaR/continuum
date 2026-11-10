import { evidenceTag } from '@continuum/core'
import { keys, type ContextStore } from '@continuum/store'
import { agentName } from './handoff'
import type { CheckSummary, DecisionSummary, ProjectState, SessionSummary } from './projectState'
import { isYourTask, type TaskSummary } from './tasks'
import { agoFromIso } from './time'

/** A file, or one top-level symbol in it. */
export interface WhyTarget {
  path: string
  symbol?: string
}

export interface WhyReport {
  /** `src/auth.ts`, or `src/auth.ts#login`. */
  target: string
  /** Whether Continuum has recorded this file at all. */
  known: boolean
  /** Records anchored to it, each with the anchor that ties it here (a symbol, or the whole file). */
  decisions: { decision: DecisionSummary; anchor: string }[]
  /** Tasks during which it was edited. */
  tasks: TaskSummary[]
  /** Checks whose latest run covered its file. */
  checks: CheckSummary[]
  /** Agent sessions that edited its file. */
  sessions: SessionSummary[]
}

const SYMBOL_PREFIX = 'symbol:'
const id = (key: string) => key.slice(key.indexOf(':') + 1)
const label = ({ path, symbol }: WhyTarget) => (symbol ? `${path}#${symbol}` : path)

/**
 * The records behind a piece of code, from links already in the graph:
 * decisions anchored to it, tasks that touched it, checks that ran against it
 * and sessions that edited it. For a file, records anchored to any symbol in
 * it count; for a symbol, so do records anchored to its whole file.
 */
export function explain(store: ContextStore, state: ProjectState, target: WhyTarget): WhyReport {
  const file = keys.file(target.path)
  const symbols = store.graph.keysOfKind('symbol').filter((key) => key.startsWith(`${SYMBOL_PREFIX}${target.path}#`))
  const anchors = target.symbol ? [keys.symbol(target.path, target.symbol), file] : [file, ...symbols]
  const linked = (key: string, type: 'anchored_to' | 'touches' | 'ran_against' | 'modified') => (store.graph.has(key) ? store.graph.neighbors(key, { direction: 'in', types: [type] }) : [])
  const allDecisions = new Map([...state.decisions, ...state.resolvedDecisions].map((decision) => [decision.id, decision]))
  const anchorOf = new Map(anchors.flatMap((anchor) => linked(anchor, 'anchored_to').map((memory) => [id(memory), anchor === file ? 'the whole file' : id(anchor)] as const)).reverse())
  const touching = new Set(linked(file, 'touches').map(id))
  const covering = new Set(linked(file, 'ran_against').map(id))
  const editing = new Set(linked(file, 'modified').map(id))
  return {
    target: label(target),
    known: store.graph.has(file),
    decisions: [...anchorOf].flatMap(([memory, anchor]) => {
      const decision = allDecisions.get(memory)
      return decision ? [{ decision, anchor }] : []
    }),
    tasks: state.tasks.filter((task) => touching.has(task.id)),
    checks: state.checks.filter((check) => covering.has(check.name)),
    sessions: state.sessions.filter((session) => editing.has(session.id)),
  }
}

const oneLine = (text: string, max = 300) => text.replace(/\s+/g, ' ').trim().slice(0, max)
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

function decisionLine({ decision, anchor }: WhyReport['decisions'][number], now: Date): string {
  const flags = [decision.status === 'anchor-changed' ? `anchored code changed since: ${decision.changed.join(', ')}` : null, decision.review === 'resolved' ? 'resolved by you' : null].filter(Boolean)
  return `- ${evidenceTag(decision.evidence)} ${decision.kind}: ${oneLine(decision.title)}${decision.body ? ` (${oneLine(decision.body)})` : ''} (anchored to ${anchor}, ${agoFromIso(decision.recordedAt, now)}${flags.length > 0 ? `; ${flags.join('; ')}` : ''})`
}

function checkLine(check: CheckSummary, path: string, now: Date): string {
  const changedHere = check.changed.includes(path)
  const status = check.status === 'out-of-date' ? `OUT OF DATE (${changedHere ? 'this file changed since it ran' : `${plural(check.changed.length, 'other file')} changed since it ran`})` : check.status.toUpperCase()
  return `- ${check.evidence === 'verified' ? '[verified]' : '[observed: run by an agent]'} ${check.name} (\`${check.command}\`): ${status}, ran ${agoFromIso(check.ranAt, now)}`
}

const taskLine = (task: TaskSummary) =>
  `- ${evidenceTag(isYourTask(task) ? 'user-reported' : 'agent-reported')} task "${task.title.replace(/"/g, "'")}" (${task.status})${task.objective ? `: ${oneLine(task.objective)}` : ''}`

const sessionLine = (session: SessionSummary, now: Date) =>
  `- [observed] ${agentName(session.agent)} session edited it, last active ${agoFromIso(session.lastActivityAt, now)}${session.note ? `. [agent-reported] ${oneLine(session.note)}` : ''}`

/** The report as text, each record with its evidence label. */
export function renderWhy(report: WhyReport, now: Date): string {
  const path = report.target.split('#')[0]
  if (!report.known) return `Continuum has no record of ${report.target}. Give a file in this repository, or one of its top-level symbols as path#name.`
  const sections: [string, string[]][] = [
    ['Decisions and notes anchored to it', report.decisions.map((entry) => decisionLine(entry, now))],
    ['Tasks that changed it', report.tasks.map(taskLine)],
    ['Checks that ran against it', report.checks.map((check) => checkLine(check, path, now))],
    ['Sessions that edited it', report.sessions.map((session) => sessionLine(session, now))],
  ]
  const filled = sections.filter(([, lines]) => lines.length > 0)
  if (filled.length === 0) return `Nothing recorded is linked to ${report.target} yet: no decision is anchored to it, and no task, check or agent session has touched it.`
  const counts = [plural(report.decisions.length, 'decision'), plural(report.tasks.length, 'task'), plural(report.checks.length, 'check'), plural(report.sessions.length, 'session')].join(', ')
  return [`What is recorded about ${report.target}: ${counts}.`, ...filled.flatMap(([title, lines]) => ['', title, ...lines])].join('\n')
}
