/** Everything the public website says, in one place, so each claim can be checked against the product. */

export const PACKAGE_NAME = '@pranavoar/continuum'
export const INSTALL_COMMAND = `npx ${PACKAGE_NAME} setup claude-code`

export const LINKS = {
  npm: `https://www.npmjs.com/package/${PACKAGE_NAME}`,
  source: 'https://github.com/PranavOaR/continuum',
  guide: 'https://github.com/PranavOaR/continuum/blob/main/docs/getting-started.md',
  changelog: 'https://github.com/PranavOaR/continuum/blob/main/CHANGELOG.md',
} as const

export const DEMO_VIDEO = {
  src: '/demo/continuum-demo.mp4',
  poster: '/demo/continuum-demo.jpg',
  caption: 'Claude Code fixes one of two bugs and stops. Codex starts with Continuum’s briefing, finishes the same task, and the dashboard shows who did what. Recorded from real sessions.',
} as const

export const STEPS = [
  {
    title: 'Records the work',
    body: 'Hooks record each session, the files the agent edits, the tests it runs with their exit codes, and your commits. Agents keep the task current through MCP tools.',
  },
  {
    title: 'Knows which results still hold',
    body: '`continuum run -- npm test` ties a result to the exact content of every file it covered. Change one of those files and the result is marked out of date, naming the file.',
  },
  {
    title: 'Briefs the next session',
    body: 'Every new session starts with a handoff: the task and its next step, what changed since that agent last worked, which checks hold, and the decisions that apply.',
  },
] as const

export const EVIDENCE_LABELS = [
  { label: 'verified', meaning: 'A check Continuum ran itself, tied to the exact files it covered.' },
  { label: 'observed', meaning: 'An agent ran it, and Continuum saw the exit code.' },
  { label: 'agent-reported', meaning: 'An agent said so. A note, not proof.' },
  { label: 'set by you', meaning: 'You changed it in the dashboard.' },
] as const

export const AGENT_SETUPS = [
  { name: 'Claude Code', command: 'setup claude-code', detail: 'Hooks and MCP server, or install the Claude Code plugin instead.' },
  { name: 'Codex', command: 'setup codex', detail: 'Hooks and MCP server. Trust the project, then review the hooks with /hooks.' },
  { name: 'Cursor', command: 'setup cursor', detail: 'MCP server and an always-applied rule.' },
] as const

export const PRIVACY_POINTS = [
  'Everything is stored in `.continuum/` inside your repository. No account, no cloud service.',
  'The dashboard (`continuum serve`) listens on 127.0.0.1 only, behind a per-run access token.',
  'Keep paths out with `.continuumignore`. Remove data with `continuum forget`, or all of it with `continuum uninstall --purge`.',
] as const
