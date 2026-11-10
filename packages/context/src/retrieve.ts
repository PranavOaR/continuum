import { CHARS_PER_TOKEN, evidenceTag, type EvidenceType } from '@continuum/core'
import { anchoredPath, keys, searchGraph, type ContextStore } from '@continuum/store'
import type { ProjectState } from './projectState'
import { isYourTask, type TaskSummary } from './tasks'
import { agoFromIso } from './time'

export const DEFAULT_CONTEXT_TOKENS = 1_500
/** Relevance halves for every this-many days without activity. */
const RECENCY_HALF_LIFE_DAYS = 3
const DAY_MS = 86_400_000

/** How much a claim can be relied on, by how it was recorded. */
const EVIDENCE_WEIGHT: Record<EvidenceType, number> = {
  verified: 1,
  'user-reported': 0.9,
  observed: 0.8,
  'agent-reported': 0.6,
  inferred: 0.4,
  simulated: 0.1,
}

/** How closely an item is tied to the task in the context graph. */
const RELEVANCE = { task: 1, linked: 0.8, project: 0.35 } as const
/** Items that need doing something about outrank merely informative ones. */
const ACTIONABLE_BOOST = 0.5
/** Added to a record holding every word of the query; one holding half of them gets half. */
const QUERY_BOOST = 1
/** Records considered for a query; the ranking only lifts ones that are already candidates. */
const MAX_QUERY_MATCHES = 200

export interface ContextItem {
  kind: 'task' | 'check' | 'decision' | 'session' | 'change' | 'commit'
  /** One line, ready to show, with its evidence label. */
  text: string
  score: number
  /** Why it scored as it did, so a ranking can be checked rather than trusted. */
  why: string
}

const recency = (iso: string | null, now: Date) => (iso ? 0.5 ** (Math.max(0, now.getTime() - Date.parse(iso)) / DAY_MS / RECENCY_HALF_LIFE_DAYS) : 0.5)
const round = (value: number) => Math.round(value * 100) / 100
const line = (value: string, max = 240) => value.replace(/\s+/g, ' ').trim().slice(0, max)

function score(relevance: number, evidence: EvidenceType, recencyWeight: number, actionable: boolean): number {
  return round(relevance * EVIDENCE_WEIGHT[evidence] * (0.5 + 0.5 * recencyWeight) + (actionable ? ACTIONABLE_BOOST : 0))
}

function taskItem(task: TaskSummary): ContextItem {
  const remaining = task.remainingSteps.length > 0 ? ` Remaining: ${task.remainingSteps.join('; ')}.` : ''
  const next = task.nextAction ? ` Next: ${task.nextAction}.` : ''
  return {
    kind: 'task',
    text: line(`${evidenceTag(isYourTask(task) ? 'user-reported' : 'agent-reported')} Task "${task.title.replace(/"/g, "'")}" (${task.status}).${task.objective ? ` Objective: ${task.objective}.` : ''}${remaining}${next}`, 600),
    score: 2,
    why: 'the task itself always comes first',
  }
}

/** Decision id → anchored file paths, read from the graph (the summary keeps only what changed). */
function decisionAnchors(store: ContextStore): Map<string, string[]> {
  return new Map(
    store.graph.keysOfKind('memory').map((key) => {
      const anchors = (store.graph.get(key)?.props.anchors ?? {}) as Record<string, string>
      return [key.slice('memory:'.length), Object.keys(anchors).flatMap((anchor) => anchoredPath(anchor) ?? [])]
    }),
  )
}

/**
 * Every piece of recorded context, scored for one task: how closely it is tied
 * to the task in the graph, how much its evidence can be trusted, how recent it
 * is, and whether it needs action (a failing or out-of-date check, a decision
 * whose code changed). With a `query`, a decision or session note holding its
 * words is lifted, so an on-topic record from another task is not buried.
 * Highest first.
 */
interface QueryMatch {
  boost: number
  why: string
}

/** What a query adds to each record that holds its words, by graph key. */
function queryMatches(store: ContextStore, query: string | undefined): Map<string, QueryMatch> {
  if (!query) return new Map()
  return new Map(
    searchGraph(store.graph, query, { limit: MAX_QUERY_MATCHES, kinds: ['memory', 'session'] }).map((hit) => [
      hit.key,
      { boost: QUERY_BOOST * hit.coverage, why: `matches ${hit.matched.map((word) => `"${word}"`).join(', ')}; ` },
    ]),
  )
}

const NO_MATCH: QueryMatch = { boost: 0, why: '' }

export function rankContext(store: ContextStore, state: ProjectState, options: { taskId?: string; now: Date; query?: string }): ContextItem[] {
  const task = state.tasks.find((candidate) => candidate.id === (options.taskId ?? state.currentTaskId))
  const taskFiles = new Set(task?.files ?? [])
  const touchesTask = (paths: readonly string[]) => paths.some((path) => taskFiles.has(path))
  const anchors = decisionAnchors(store)
  const { now } = options
  const matched = queryMatches(store, options.query)
  const items: ContextItem[] = task ? [taskItem(task)] : []

  for (const check of state.checks) {
    if (check.status === 'not-run') continue
    const actionable = check.status === 'failed' || check.status === 'out-of-date'
    const relevance = touchesTask(check.changed) ? RELEVANCE.linked : RELEVANCE.project
    const detail = check.status === 'out-of-date' ? `OUT OF DATE (changed since: ${check.changed.slice(0, 6).join(', ')})` : check.status.toUpperCase()
    items.push({
      kind: 'check',
      text: line(`${check.evidence === 'verified' ? '[verified]' : '[observed: run by an agent]'} ${check.name}: ${detail}, ran ${agoFromIso(check.ranAt, now)}`),
      score: score(relevance, check.evidence, recency(check.ranAt, now), actionable),
      why: `${actionable ? 'needs action; ' : ''}${relevance === RELEVANCE.linked ? 'covers task files' : 'project-wide'}`,
    })
  }

  for (const decision of state.decisions) {
    const anchored = anchors.get(decision.id) ?? []
    const relevance = touchesTask(anchored) ? RELEVANCE.linked : RELEVANCE.project
    const stale = decision.status === 'anchor-changed'
    const match = matched.get(keys.memory(decision.id)) ?? NO_MATCH
    items.push({
      kind: 'decision',
      text: line(`${evidenceTag(decision.evidence)} ${decision.kind}: ${decision.title}${decision.body ? ` (${decision.body})` : ''}${stale ? ` [anchored code changed: ${decision.changed.join(', ')}]` : ''}`),
      score: round(score(relevance, decision.evidence, recency(decision.recordedAt, now), stale) + match.boost),
      why: `${match.why}${stale ? 'its code changed; ' : ''}${relevance === RELEVANCE.linked ? 'anchored to task files' : 'project-wide'}`,
    })
  }

  for (const session of state.sessions.slice(0, 5)) {
    if (!session.note) continue
    const relevance = touchesTask(session.filesChanged.map((file) => file.path)) ? RELEVANCE.linked : RELEVANCE.project
    const match = matched.get(keys.session(session.id)) ?? NO_MATCH
    items.push({
      kind: 'session',
      text: line(`[agent-reported] ${session.agent} session, ${agoFromIso(session.lastActivityAt, now)}: ${session.note}`),
      score: round(score(relevance, 'agent-reported', recency(session.lastActivityAt, now), false) + match.boost),
      why: `${match.why}${relevance === RELEVANCE.linked ? 'worked on task files' : 'recent session'}`,
    })
  }

  for (const change of state.files.outsideSessions.slice(0, 20)) {
    const relevance = taskFiles.has(change.path) ? RELEVANCE.linked : RELEVANCE.project
    items.push({
      kind: 'change',
      text: line(`[observed] ${change.path} was ${change.changeType} outside any agent session ${agoFromIso(change.at, now)}`),
      score: score(relevance, 'observed', recency(change.at, now), relevance === RELEVANCE.linked),
      why: relevance === RELEVANCE.linked ? 'a task file changed by hand' : 'changed by hand',
    })
  }

  for (const commit of state.commits) {
    items.push({
      kind: 'commit',
      text: line(`[observed] committed ${commit.hash.slice(0, 7)} "${commit.message}" (${commit.files} files, ${agoFromIso(commit.recordedAt, now)})`),
      score: score(RELEVANCE.project, 'observed', recency(commit.recordedAt, now), false),
      why: 'recent commit',
    })
  }

  return items.sort((a, b) => b.score - a.score)
}

/** The highest-ranked items that fit the budget, each with its score, and a count of what was left out. */
export function renderContext(items: readonly ContextItem[], budgetTokens: number = DEFAULT_CONTEXT_TOKENS): string {
  const budget = budgetTokens * CHARS_PER_TOKEN
  const lines: string[] = []
  let used = 0
  let skipped = 0
  for (const item of items) {
    const entry = `- (${item.score.toFixed(2)}; ${item.why}) ${item.text}`
    if (used + entry.length + 1 > budget) {
      skipped += 1
      continue
    }
    lines.push(entry)
    used += entry.length + 1
  }
  const header = `Context ranked for this task (score; why). About ${Math.ceil(used / CHARS_PER_TOKEN)} of ${budgetTokens} tokens used.`
  const footer = skipped > 0 ? [`(${skipped} lower-ranked item${skipped === 1 ? '' : 's'} left out; raise budget_tokens to see more.)`] : []
  return [header, ...(lines.length > 0 ? lines : ['Nothing recorded yet.']), ...footer].join('\n')
}
