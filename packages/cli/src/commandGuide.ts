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

export interface TableStyle {
  /** The terminal's width; the table fits within it, up to a comfortable maximum. */
  columns?: number
  /** Colour the borders and headings; only for a terminal that shows colour. */
  hasColour?: boolean
}

const DEFAULT_WIDTH = 100
const MAX_WIDTH = 110
const MIN_DESCRIPTION = 20
/** The iris ramp of the banner: borders, then the title, then group headings. */
const BORDER = '38;5;105'
const TITLE = '1;38;5;147'
const GROUP = '1;38;5;147'
const BOLD = '1'

const paint = (style: string, text: string, hasColour: boolean) => (hasColour ? `\x1b[${style}m${text}\x1b[0m` : text)

/** `text` broken into lines of at most `width` characters, at spaces where it can be. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    for (let rest = word; rest.length > 0; rest = rest.slice(width)) {
      const piece = rest.slice(0, width)
      if (line === '') line = piece
      else if (line.length + 1 + piece.length <= width) line += ` ${piece}`
      else {
        lines.push(line)
        line = piece
      }
      if (rest.length <= width) break
    }
  }
  return [...lines, line]
}

/**
 * The commands a person can run next, as a bordered table: a title, a
 * header row, a heading row per group spanning both columns, and a line
 * between every row. `prefix` is how they start Continuum, e.g.
 * `npx -y getcontinuum@0.7.0`. Shown once setup is done.
 */
export function commandGuide(prefix: string, style: TableStyle = {}): string[] {
  const hasColour = style.hasColour ?? false
  const total = Math.min(Math.max(style.columns ?? DEFAULT_WIDTH, 0), MAX_WIDTH)
  const left = Math.max('Command'.length, ...GUIDE.flatMap(([, commands]) => commands.map(([command]) => command.length)))
  const right = Math.max(MIN_DESCRIPTION, total - left - 7)
  const span = left + right + 3
  const border = (text: string) => paint(BORDER, text, hasColour)
  const rule = (start: string, joint: string, end: string, fill = '─') => border(`${start}${fill.repeat(left + 2)}${joint}${fill.repeat(right + 2)}${end}`)
  const full = (text: string, look: string) => `${border('│')} ${paint(look, text.padEnd(span), hasColour)} ${border('│')}`
  const row = (command: string, description: string, look = BOLD) =>
    wrap(description, right).map((part, index) => `${border('│')} ${paint(look, (index === 0 ? command : '').padEnd(left), hasColour)} ${border('│')} ${part.padEnd(right)} ${border('│')}`)
  // Each group opens by closing the column line above it; the first follows the header's own rule instead.
  const groups = GUIDE.flatMap(([group, commands]) => [
    rule('├', '┴', '┤'),
    full(group, GROUP),
    rule('├', '┬', '┤'),
    ...commands.flatMap(([command, description], position) => [...(position > 0 ? [rule('├', '┼', '┤')] : []), ...row(command, description)]),
  ])
  return [
    `Run any of them as ${prefix} <command>:`,
    border(`┌${'─'.repeat(span + 2)}┐`),
    full('Commands you can run', TITLE),
    rule('├', '┬', '┤'),
    ...row('Command', 'What it does', TITLE),
    rule('╞', '╧', '╡', '═'),
    ...groups.slice(1),
    rule('└', '┴', '┘'),
    `${prefix} --help lists every option.`,
  ]
}
