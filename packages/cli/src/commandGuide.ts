import { columns } from './format'

/** The commands a person uses, by when they reach for them. Agents' own commands (mcp, ingest) are left out. */
const GUIDE: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
  [
    'While you work',
    [
      ['status', 'What is recorded, what changed, and whether checks still hold'],
      ['run -- <command>', 'Run tests or a build and record a verified result'],
      ['handoff', 'Print where the work left off, for any agent or chat'],
      ['serve', 'Open the dashboard in your browser'],
    ],
  ],
  [
    'Ask the project memory',
    [
      ['search <words>', 'Find decisions, issues, tasks and notes by their words'],
      ['why <file>[#symbol]', 'The decisions, tasks and checks behind a piece of code'],
      ['check', 'Decisions your staged changes touch, for a pre-commit hook'],
    ],
  ],
  [
    'Settings and data',
    [
      ['profile', 'Your preferences, carried into every repository\'s briefing'],
      ['config', 'Settings: recall, reflection, agent-checks, prompts, receipts, update-check'],
      ['export <file>', 'Save the history to move it to another machine (import restores it)'],
      ['forget', 'Permanently remove recorded data'],
    ],
  ],
  [
    'Keep it working',
    [
      ['doctor', 'Check the setup and say how to fix problems; --report --open reports one'],
      ['update', 'Point every connected agent at the newest version'],
      ['setup <agent>', 'Connect another agent: claude-code, codex, cursor, vscode, antigravity'],
      ['uninstall', 'Disconnect every agent; --purge also deletes the history'],
    ],
  ],
]

/**
 * A short table of what a person can run next, shown once setup is done.
 * `prefix` is how they start Continuum, e.g. `npx -y getcontinuum@0.6.0`.
 */
export function commandGuide(prefix: string): string[] {
  const rows = GUIDE.flatMap(([group, commands]) => [[group.toUpperCase(), ''], ...commands.map(([command, description]) => [`  ${command}`, description])])
  return [`Commands you can run, as ${prefix} <command>:`, ...columns(rows, 3).map((line) => `  ${line}`), `${prefix} --help lists every option.`]
}
