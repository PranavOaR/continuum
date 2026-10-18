import { basename } from 'node:path'
import type { CheckSummary, DecisionSummary, ProjectState, SessionSummary } from './projectState'
import { isQuiet, type SinceYouLeft } from './sinceYouLeft'
import type { TaskSummary } from './tasks'
import { agoFromIso } from './time'

/** Fits comfortably in a SessionStart hook (10k chars) and an MCP tool result. */
export const DEFAULT_HANDOFF_CHARS = 8_000
const MAX_NOTE_CHARS = 600
const MAX_LISTED = 12
const EARLIER_SESSIONS = 3

export interface HandoffOptions {
  maxChars?: number
  now?: Date
  /** For an agent resuming here: what changed since its previous session. Shown first. */
  since?: SinceYouLeft | null
}

const KIND_LABELS: Record<DecisionSummary['kind'], string> = {
  decision: 'Decision',
  'known-issue': 'Known issue',
  'previous-attempt': 'Previous attempt',
  'next-action': 'Next action',
}

/** Agent-written text, flattened to one line and quoted, so it reads as data rather than as headings or instructions. */
function quote(text: string, limit = MAX_NOTE_CHARS): string {
  const flat = text.replace(/\s*\n+\s*/g, ' / ').replace(/\s+/g, ' ').trim()
  const clipped = flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
  return `"${clipped.replace(/"/g, "'")}"`
}

const MAX_IDENTIFIER_CHARS = 200
// oxlint-disable-next-line no-control-regex -- removing control characters is the purpose
const UNSAFE_IN_CODE = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029`]', 'g')

/** Repository-controlled identifiers (paths, check names, commands) as inline code: one line, no backticks, bounded. */
function code(text: string): string {
  const safe = text.replace(UNSAFE_IN_CODE, ' ').trim()
  return `\`${safe.length > MAX_IDENTIFIER_CHARS ? `${safe.slice(0, MAX_IDENTIFIER_CHARS - 1)}…` : safe}\``
}

function listPaths(paths: readonly string[]): string {
  const shown = paths.slice(0, MAX_LISTED).map(code).join(', ')
  return paths.length > MAX_LISTED ? `${shown} and ${paths.length - MAX_LISTED} more` : shown
}

function describeSession(session: SessionSummary, now: Date): string {
  const state = session.ended ? 'ended' : 'still open'
  return `${code(session.agent)} session, started ${agoFromIso(session.startedAt, now)}, last active ${agoFromIso(session.lastActivityAt, now)}, ${state}`
}

const MAX_STEPS = 8

const step = (text: string) => `  - ${quote(text, 200).slice(1, -1)}`

/** Remaining steps: the next ones first. */
function upcoming(label: string, steps: readonly string[]): string[] {
  if (steps.length === 0) return []
  const more = steps.length > MAX_STEPS ? [`  - …and ${steps.length - MAX_STEPS} more`] : []
  return [`${label}:`, ...steps.slice(0, MAX_STEPS).map(step), ...more]
}

/** Completed steps: the most recent ones, since those say where work stopped. */
function recent(label: string, steps: readonly string[]): string[] {
  if (steps.length === 0) return []
  const earlier = steps.length > MAX_STEPS ? [`  - …${steps.length - MAX_STEPS} earlier`] : []
  return [`${label}:`, ...earlier, ...steps.slice(-MAX_STEPS).map(step)]
}

function describeTask(task: TaskSummary): string[] {
  const lines = [`[agent-reported] ${quote(task.title, 200)} (${task.status})`]
  if (task.userEdited.length > 0) lines.push(`[set by you] Changed in the dashboard: ${task.userEdited.map((field) => FIELD_LABEL[field]).join(', ')}`)
  if (task.objective) lines.push(`Objective: ${quote(task.objective)}`)
  if (task.nextAction) lines.push(`Next action: ${quote(task.nextAction)}`)
  if (task.acceptanceCriteria.length > 0) {
    lines.push('Acceptance criteria:')
    for (const criterion of task.acceptanceCriteria.slice(0, MAX_STEPS)) lines.push(`  - [${criterion.met ? 'x' : ' '}] ${quote(criterion.text, 200).slice(1, -1)}`)
  }
  lines.push(...recent('Done', task.completedSteps), ...upcoming('Remaining', task.remainingSteps))
  if (task.files.length > 0) lines.push(`Files touched: ${listPaths(task.files)}`)
  return lines
}

function taskSection(state: ProjectState): string[] {
  const current = state.tasks.find((task) => task.id === state.currentTaskId)
  if (!current) return []
  return ['## Current task', ...describeTask(current)]
}

function commitLines(state: ProjectState, now: Date): string[] {
  return state.commits.map((commit) => `Committed [observed]: ${code(commit.hash.slice(0, 7))} ${quote(commit.message)} (${agoFromIso(commit.recordedAt, now)})`)
}

function leftOffSection(state: ProjectState, now: Date): string[] {
  const [latest] = state.sessions
  if (!latest) return ['## Where we left off', 'No agent sessions recorded yet.', ...commitLines(state, now)]
  const lines = ['## Where we left off', `Latest: ${describeSession(latest, now)}.`]
  if (latest.prompt) lines.push(`Last request [said by you]: ${quote(latest.prompt)}`)
  if (latest.note) lines.push(`Last note [agent-reported]: ${quote(latest.note)}`)
  if (latest.filesChanged.length > 0) {
    const files = latest.filesChanged.map((file) => (file.exists ? code(file.path) : `${code(file.path)} (since deleted)`))
    const shown = files.slice(0, MAX_LISTED).join(', ')
    lines.push(`Files it changed: ${files.length > MAX_LISTED ? `${shown} and ${files.length - MAX_LISTED} more` : shown}`)
  }
  return [...lines, ...commitLines(state, now)]
}

const FIELD_LABEL: Record<TaskSummary['userEdited'][number], string> = {
  status: 'status',
  nextAction: 'next action',
  steps: 'steps done',
  criteria: 'acceptance criteria met',
}

/** Everything recorded while this agent was away, so it does not assume the code is as it left it. */
function sinceSection(since: SinceYouLeft | null | undefined, now: Date): string[] {
  if (!since) return []
  const heading = `## Since your last session (${agoFromIso(since.since, now)})`
  if (isQuiet(since)) return [heading, 'Nothing was recorded since then.']
  const lines = [heading]
  for (const session of since.otherSessions) {
    const files = session.files.length > 0 ? `changed ${listPaths(session.files)}` : 'changed no files'
    lines.push(`- [observed] A ${code(session.agent)} session ${files}.${session.note ? ` Its last note [agent-reported]: ${quote(session.note, 200)}` : ''}`)
  }
  if (since.outsideChanges.length > 0) lines.push(`- [observed] Changed outside agent sessions: ${listPaths(since.outsideChanges)}`)
  for (const edit of since.taskEdits) {
    lines.push(`- [set by you] You changed ${edit.fields.map((field) => FIELD_LABEL[field]).join(', ') || 'the task'} of ${quote(edit.title, 120)} in the dashboard.`)
  }
  for (const check of since.checks) {
    lines.push(`- ${check.evidence === 'verified' ? '[verified]' : '[observed: run by an agent]'} ${code(check.name)} ${check.passed ? 'passed' : 'FAILED'}.`)
  }
  for (const commit of since.commits.slice(-MAX_LISTED)) lines.push(`- [observed] Committed ${code(commit.hash.slice(0, 7))} ${quote(commit.message, 120)}`)
  for (const title of since.decisions) lines.push(`- [agent-reported] Decision recorded: ${quote(title, 160)}`)
  return lines
}

function describeCheck(check: CheckSummary, now: Date): string {
  const tag = check.evidence === 'verified' ? '[verified]' : '[observed: run by an agent]'
  const ran = `Ran ${agoFromIso(check.ranAt, now)}`
  const label = check.name === check.command ? code(check.name) : `${code(check.name)} (${code(check.command)})`
  switch (check.status) {
    case 'out-of-date':
      return `- ${tag} OUT OF DATE: ${label}. ${ran}; changed since: ${listPaths(check.changed)}`
    case 'failed':
      return `- ${tag} FAILED: ${label}, exit ${check.exitCode ?? '?'}. ${ran}`
    case 'passed':
      return `- ${tag} passed: ${label}. ${ran}`
    default:
      return `- ${check.status}: ${label}`
  }
}

function checksSection(state: ProjectState, now: Date): string[] {
  if (state.checks.length === 0) return ['## Checks', 'No checks recorded yet.']
  return ['## Checks', ...state.checks.map((check) => describeCheck(check, now))]
}

function decisionsSection(state: ProjectState): string[] {
  if (state.decisions.length === 0) return []
  return [
    '## Decisions and notes',
    ...state.decisions.map((decision) => {
      const stale = decision.status === 'anchor-changed' ? ` (anchored code changed since: ${listPaths(decision.changed)})` : ''
      const body = decision.body ? ` ${quote(decision.body).slice(1, -1)}` : ''
      return `- [${decision.evidence}] ${KIND_LABELS[decision.kind]}: ${quote(decision.title).slice(1, -1)}.${body}${stale}`
    }),
  ]
}

/** Changes no agent session made or explained: ask about them rather than assume they are part of the task. */
function outsideSessionsSection(state: ProjectState): string[] {
  const { unrecorded, outsideSessions } = state.files
  const pending = new Set(unrecorded.map((change) => change.path))
  const changes = [
    ...unrecorded.map((change) => `- ${change.changeType} ${code(change.path)} (not yet recorded)`),
    ...outsideSessions.filter((change) => !pending.has(change.path)).map((change) => `- ${change.changeType} ${code(change.path)}`),
  ]
  if (changes.length === 0) return []
  const more = changes.length > MAX_LISTED ? [`- …and ${changes.length - MAX_LISTED} more`] : []
  return [
    '## Changed outside agent sessions',
    '[observed] No agent session made or explained these: edits by hand, or by a tool Continuum does not see.',
    ...changes.slice(0, MAX_LISTED),
    ...more,
  ]
}

function earlierSection(state: ProjectState, now: Date): string[] {
  const earlier = state.sessions.slice(1, 1 + EARLIER_SESSIONS)
  if (earlier.length === 0) return []
  return [
    '## Earlier sessions',
    ...earlier.map((session) => {
      const note = session.note ? `: ${quote(session.note, 200)}` : ''
      return `- ${describeSession(session, now)}${note}`
    }),
  ]
}

/** Appends sections in priority order until the budget runs out, then says what was cut. */
function fit(sections: readonly string[][], maxChars: number): string {
  const notice = '\n\n… (truncated to fit; call get_project_state for the rest)'
  let output = ''
  for (const section of sections) {
    for (const line of section) {
      const separator = output === '' ? '' : line.startsWith('## ') ? '\n\n' : '\n'
      if (output.length + separator.length + line.length + notice.length > maxChars) return `${output}${notice}`.slice(0, maxChars)
      output += separator + line
    }
  }
  return output
}

/**
 * Renders "where we left off" for an agent starting fresh. Every claim carries
 * its evidence: verified (a recorded run), observed (file capture) or
 * agent-reported (what an agent said, never proof).
 */
export function renderHandoff(state: ProjectState, options: HandoffOptions = {}): string {
  const now = options.now ?? new Date(state.generatedAt)
  const header = [
    `# Continuum handoff: ${basename(state.root)}`,
    `Generated ${state.generatedAt}, revision ${state.revision ?? 'none (no commits yet)'}, ${state.files.tracked} tracked files.`,
    'Evidence labels: [verified] = check run by Continuum, [observed: run by an agent] = an agent ran it and its exit code was observed, [agent-reported] = an agent said so, not proof, [set by you] = you set it in the dashboard.',
  ]
  return fit(
    [header, sinceSection(options.since, now), taskSection(state), leftOffSection(state, now), checksSection(state, now), decisionsSection(state), outsideSessionsSection(state), earlierSection(state, now)],
    options.maxChars ?? DEFAULT_HANDOFF_CHARS,
  )
}
