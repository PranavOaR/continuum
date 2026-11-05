const INDENT = '  '

const WORDMARK = [
  '███████ ███████ ███  ██ ███████ ██ ███  ██ ██   ██ ██   ██ ███ ███',
  '██      ██   ██ ████ ██   ███   ██ ████ ██ ██   ██ ██   ██ ███████',
  '██      ██   ██ ██ ████   ███   ██ ██ ████ ██   ██ ██   ██ ██ █ ██',
  '██      ██   ██ ██  ███   ███   ██ ██  ███ ██   ██ ██   ██ ██   ██',
  '███████ ███████ ██   ██   ███   ██ ██   ██ ███████ ███████ ██   ██',
]

/** The website's iris, light to deep, one colour per row. From xterm's 256 colours: macOS Terminal has no true colour. */
const IRIS_RAMP = [147, 147, 105, 99, 63]
const RAMP_COLOURS = 256
const DIM = '2'

/** A terminal narrower than this would wrap the wordmark into noise. */
export const BANNER_COLUMNS = INDENT.length + WORDMARK[0].length

const paint = (style: string, text: string) => `\x1b[${style}m${text}\x1b[0m`

/** The block-letter wordmark and tagline, as lines. */
export function renderBanner(version: string, hasColour: boolean): string[] {
  const tagline = `v${version} · local-first · everything stays on this machine`
  const wordmark = WORDMARK.map((row, index) => (hasColour ? paint(`38;5;${IRIS_RAMP[index]}`, row) : row))
  return ['', ...wordmark.map((row) => INDENT + row), '', INDENT + (hasColour ? paint(DIM, tagline) : tagline), '']
}

export interface Terminal {
  isTTY?: boolean
  columns?: number
  hasColors?: (count: number) => boolean
}

/**
 * The banner for someone reading at a terminal, and nothing for anyone else:
 * agents, pipes and CI read this output, and `mcp` speaks JSON-RPC on stdout.
 * `hasColors` already honours NO_COLOR and TERM=dumb.
 */
export function terminalBanner(terminal: Terminal, env: NodeJS.ProcessEnv, version: string): string[] {
  if (!terminal.isTTY || env.CI || (terminal.columns ?? 0) < BANNER_COLUMNS) return []
  return renderBanner(version, terminal.hasColors?.(RAMP_COLOURS) ?? false)
}

/** Opens a command that starts Continuum; commands other programs read never call this. */
export function printBanner(io: { out: (line: string) => void; banner?: readonly string[] }): void {
  for (const line of io.banner ?? []) io.out(line)
}
