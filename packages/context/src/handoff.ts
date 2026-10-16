import { basename } from 'node:path'
import type { CheckSummary, DecisionSummary, ProjectState, SessionSummary } from './projectState'
import { agoFromIso } from './time'

/** Fits comfortably in a SessionStart hook (10k chars) and an MCP tool result. */
export const DEFAULT_HANDOFF_CHARS = 8_000
const MAX_NOTE_CHARS = 600
const MAX_LISTED = 12
const EARLIER_SESSIONS = 3

export interface HandoffOptions {
  maxChars?: number
  now?: Date
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

function leftOffSection(state: ProjectState, now: Date): string[] {
  const [latest] = state.sessions
  if (!latest) return ['## Where we left off', 'No agent sessions recorded yet.']
  const lines = ['## Where we left off', `Latest: ${describeSession(latest, now)}.`]
  if (latest.note) lines.push(`Last note [agent-reported]: ${quote(latest.note)}`)
  if (latest.filesChanged.length > 0) {
    const files = latest.filesChanged.map((file) => (file.exists ? code(file.path) : `${code(file.path)} (since deleted)`))
    const shown = files.slice(0, MAX_LISTED).join(', ')
    lines.push(`Files it changed: ${files.length > MAX_LISTED ? `${shown} and ${files.length - MAX_LISTED} more` : shown}`)
  }
  return lines
}

function describeCheck(check: CheckSummary, now: Date): string {
  const ran = `Ran ${agoFromIso(check.ranAt, now)}`
  const label = `${code(check.name)} (${code(check.command)})`
  switch (check.status) {
    case 'out-of-date':
      return `- [verified] OUT OF DATE: ${label}. ${ran}; changed since: ${listPaths(check.changed)}`
    case 'failed':
      return `- [verified] FAILED: ${label}, exit ${check.exitCode ?? '?'}. ${ran}`
    case 'passed':
      return `- [verified] passed: ${label}. ${ran}`
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

function unrecordedSection(state: ProjectState): string[] {
  const { unrecorded } = state.files
  if (unrecorded.length === 0) return []
  const shown = unrecorded.slice(0, MAX_LISTED).map((change) => `- ${change.changeType} ${code(change.path)}`)
  const more = unrecorded.length > MAX_LISTED ? [`- …and ${unrecorded.length - MAX_LISTED} more`] : []
  return ['## Changes not yet recorded', ...shown, ...more]
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
    'Evidence labels: [verified] = recorded check run, [agent-reported] = an agent said so, not proof.',
  ]
  return fit(
    [header, leftOffSection(state, now), checksSection(state, now), decisionsSection(state), unrecordedSection(state), earlierSection(state, now)],
    options.maxChars ?? DEFAULT_HANDOFF_CHARS,
  )
}
