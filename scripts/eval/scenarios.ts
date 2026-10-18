/**
 * Recorded histories with the questions a fresh agent must be able to answer
 * from Continuum's briefing alone. `expect` patterns must all appear in the
 * answer; `forbid` patterns must not (a misleading claim scores zero).
 */
import type { ContinuumEvent } from '../../packages/core/src/index'

export interface Question {
  id: string
  ask: string
  expect: RegExp[]
  forbid?: RegExp[]
  /** Briefing mode: the section heading (start of) the answer must be found under, e.g. "Since your last session". */
  section?: string
  /** Briefing mode: exact wording the briefing must contain, when answers may phrase it freely. Defaults to `expect`. */
  inBriefing?: RegExp[]
}

export interface Scenario {
  name: string
  /** Files as they are now: path → content hash. */
  files: Record<string, string>
  events: ContinuumEvent[]
  /** The session being briefed, for "since your last session". */
  resumingSession: { sessionId: string; agent: string }
  questions: Question[]
}

const NOW = Date.parse('2026-10-16T12:00:00.000Z')
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()
export const EVAL_NOW = new Date(NOW)

function e(type: ContinuumEvent['type'], payload: Record<string, unknown>, minutes: number, evidence: ContinuumEvent['evidence'] = 'observed', source = 'eval'): ContinuumEvent {
  return { type, payload, evidence, source, occurredAt: minutesAgo(minutes) } as ContinuumEvent
}

export const SCENARIOS: Scenario[] = [
  {
    name: 'resume a half-finished task after another agent and a hand edit',
    files: { 'src/auth/login.ts': 'h-login-2', 'src/auth/callback.ts': 'h-cb-1', 'src/auth/session.ts': 'h-sess-1', 'README.md': 'h-readme-2' },
    events: [
      e('file.changed', { path: 'src/auth/login.ts', contentHash: 'h-login-0', changeType: 'added' }, 600, 'observed', 'watcher:git'),
      e('file.changed', { path: 'src/auth/session.ts', contentHash: 'h-sess-1', changeType: 'added' }, 600, 'observed', 'watcher:git'),
      e('file.changed', { path: 'README.md', contentHash: 'h-readme-1', changeType: 'added' }, 600, 'observed', 'watcher:git'),
      e('task.upserted', { id: 'google-auth', title: 'Add Google sign-in', status: 'in-progress', objective: 'Users can sign in with Google', nextAction: 'Validate the OAuth state parameter', acceptanceCriteria: [{ text: 'Callback rejects a forged state', met: false }], completedSteps: ['Add the callback route'], remainingSteps: ['Validate state', 'Write tests'] }, 300, 'agent-reported', 'mcp'),
      e('session.started', { sessionId: 'claude-1', agent: 'claude-code', taskId: 'google-auth' }, 300),
      e('file.changed', { path: 'src/auth/login.ts', contentHash: 'h-login-1', changeType: 'modified', sessionId: 'claude-1', taskId: 'google-auth' }, 290),
      e('file.changed', { path: 'src/auth/callback.ts', contentHash: 'h-cb-1', changeType: 'added', sessionId: 'claude-1', taskId: 'google-auth' }, 285),
      e('check.recorded', { name: 'unit', command: 'npm test', exitCode: 0, durationMs: 900, ranAgainst: { 'file:src/auth/login.ts': 'h-login-1', 'file:src/auth/session.ts': 'h-sess-1' } }, 280, 'verified', 'cli'),
      e('check.recorded', { name: 'e2e', command: 'npm run e2e', exitCode: 1, durationMs: 4000, ranAgainst: { 'file:src/auth/callback.ts': 'h-cb-1' } }, 275, 'verified', 'cli'),
      e('memory.recorded', { id: 'reuse-session', kind: 'decision', title: 'Callbacks reuse createSession', body: 'Never mint tokens in the callback.', anchors: { 'file:src/auth/session.ts': 'h-sess-1' } }, 270, 'agent-reported', 'mcp'),
      e('session.ended', { sessionId: 'claude-1', summary: 'Callback route wired; state validation still missing.' }, 260, 'agent-reported'),
      // While Claude was away: Codex edited login.ts, and someone edited the README by hand.
      e('session.started', { sessionId: 'codex-1', agent: 'codex' }, 120),
      e('file.changed', { path: 'src/auth/login.ts', contentHash: 'h-login-2', changeType: 'modified', sessionId: 'codex-1' }, 110),
      e('session.ended', { sessionId: 'codex-1', summary: 'Renamed the login helper.' }, 100, 'agent-reported'),
      e('file.changed', { path: 'README.md', contentHash: 'h-readme-2', changeType: 'modified' }, 90, 'observed', 'watcher:git'),
    ],
    resumingSession: { sessionId: 'claude-2', agent: 'claude-code' },
    questions: [
      { id: 'task', ask: 'What task is in progress?', expect: [/google sign-in/i], section: 'Current task' },
      { id: 'next', ask: 'What is the next step?', expect: [/state/i] },
      { id: 'unit-trust', ask: 'Can the passing "unit" check still be trusted? Why?', expect: [/out of date|no longer|stale|not.*trust/i, /login\.ts/], forbid: [/^\s*yes\b/i], section: 'Checks' },
      { id: 'e2e', ask: 'What is the state of the "e2e" check?', expect: [/fail/i] },
      { id: 'other-agent', ask: 'Did any other agent work here since your last session? What did it change?', expect: [/codex/i, /login\.ts/], section: 'Since your last session' },
      { id: 'by-hand', ask: 'Which files were changed outside any agent session?', expect: [/README\.md/], section: 'Changed outside agent sessions' },
      { id: 'decision', ask: 'Is there a recorded decision you should follow?', expect: [/createSession/], section: 'Decisions' },
      { id: 'evidence', ask: 'Is the claim "Callback route wired" verified or only reported by an agent?', expect: [/agent|reported|not verified/i], forbid: [/\bit is verified\b/i] },
    ],
  },
  {
    name: 'no task recorded: pick up from the last session and pending edits',
    files: { 'app.py': 'h-app-2', 'tests/test_app.py': 'h-test-1', 'notes.txt': 'h-notes-1' },
    events: [
      e('file.changed', { path: 'app.py', contentHash: 'h-app-0', changeType: 'added' }, 900, 'observed', 'watcher:git'),
      e('file.changed', { path: 'tests/test_app.py', contentHash: 'h-test-1', changeType: 'added' }, 900, 'observed', 'watcher:git'),
      e('session.started', { sessionId: 'claude-a', agent: 'claude-code' }, 200),
      e('file.changed', { path: 'app.py', contentHash: 'h-app-1', changeType: 'modified', sessionId: 'claude-a' }, 190),
      e('check.recorded', { name: 'pytest -q', command: 'pytest -q', exitCode: 0, durationMs: 1200, ranAgainst: { 'file:app.py': 'h-app-1', 'file:tests/test_app.py': 'h-test-1' } }, 185, 'observed', 'adapter:claude-code'),
      e('session.progress', { sessionId: 'claude-a', note: 'Added the CSV export endpoint. Pagination is still missing.' }, 180, 'agent-reported'),
      e('session.ended', { sessionId: 'claude-a' }, 175),
    ],
    resumingSession: { sessionId: 'claude-b', agent: 'claude-code' },
    questions: [
      { id: 'left-off', ask: 'Where did the last session leave off?', expect: [/csv export/i, /pagination/i], section: 'Where we left off' },
      { id: 'tests', ask: 'Do the tests pass on the current code?', expect: [/out of date|changed|not.*current|re-?run/i, /app\.py/] },
      { id: 'how-run', ask: 'Who ran the pytest check: Continuum or an agent?', expect: [/agent/i], inBriefing: [/run by an agent/i], section: 'Checks' },
      { id: 'pending', ask: 'Which changes have not been recorded yet?', expect: [/app\.py|notes\.txt/] },
    ],
  },
  {
    name: 'a task you changed in the dashboard',
    files: { 'lib/billing.ts': 'h-bill-1' },
    events: [
      e('file.changed', { path: 'lib/billing.ts', contentHash: 'h-bill-1', changeType: 'added' }, 500, 'observed', 'watcher:git'),
      e('task.upserted', { id: 'refunds', title: 'Support partial refunds', status: 'in-progress', nextAction: 'Wire the refund API', remainingSteps: ['Refund API', 'Email receipt'] }, 300, 'agent-reported', 'mcp'),
      e('session.started', { sessionId: 'claude-x', agent: 'claude-code', taskId: 'refunds' }, 300),
      e('session.ended', { sessionId: 'claude-x', summary: 'Refund model added.' }, 250, 'agent-reported'),
      e('task.upserted', { id: 'refunds', title: 'Support partial refunds', status: 'blocked', nextAction: 'Wait for finance to approve the refund rules', remainingSteps: ['Refund API', 'Email receipt'], editedFields: ['status', 'nextAction'] }, 60, 'user-reported', 'dashboard'),
    ],
    resumingSession: { sessionId: 'claude-y', agent: 'claude-code' },
    questions: [
      { id: 'status', ask: 'What is the status of the refunds task, and who set it?', expect: [/blocked/i, /\byou\b|dashboard|user|person/i], inBriefing: [/blocked/i, /set by you/i], section: 'Current task' },
      { id: 'when', ask: 'Roughly how long ago did you change the refunds task in the dashboard?', expect: [/\b1\s*h|an hour|one hour|60 min/i], inBriefing: [/in the dashboard \(1h ago\)/], section: 'Since your last session' },
      { id: 'next', ask: 'What should happen next?', expect: [/finance/i] },
      { id: 'title-source', ask: 'Was the task title written by you (the person) or by an agent?', expect: [/agent/i] },
    ],
  },
]
