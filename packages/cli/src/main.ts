import { resolve } from 'node:path'
import { CommandNotFoundError, NotAGitRepositoryError, WatchUnavailableError } from '@continuum/capture'
import { InvalidHookPayloadError, SetupError } from '@continuum/claude-code'
import { handoffCommand } from './commands/handoff'
import { ingestCommand } from './commands/ingest'
import { initCommand } from './commands/init'
import { mcpCommand } from './commands/mcp'
import { RUN_USAGE, runCommand } from './commands/run'
import { scanCommand } from './commands/scan'
import { setupCommand } from './commands/setup'
import { startCommand } from './commands/start'
import { statusCommand } from './commands/status'
import { selfInvocation } from './invocation'
import { EXIT_FAILURE, EXIT_NOT_FOUND, EXIT_OK, EXIT_USAGE, type Io } from './io'
import { NotInitializedError } from '@continuum/capture'

export const VERSION = '0.0.0'

export const HELP = `continuum — keep AI coding work continuous across sessions and agents

Usage: continuum [-C <dir>] <command> [options]

Commands
  init                 Set up Continuum in this git repository and record its files
  start                Watch the repository and record changes until Ctrl-C
  scan                 Record changes since the last scan, once
  status               Show tracked files, unrecorded changes and check results
  run -- <command>     Run a check (tests, lint, build) and record it as verified
                       ${RUN_USAGE.replace('Usage: ', '')}
  handoff              Print where the project left off, for any agent or chat
  setup claude-code    Connect Claude Code to this repository (--remove to undo)

Used by agents
  mcp                  Serve the Continuum MCP server on stdio
  ingest               Record one Claude Code hook payload from stdin

Options
  -C, --cwd <dir>      Run as if started in <dir>
  -h, --help           Show this help
  -v, --version        Show the version

Everything stays on this machine, in .continuum/ at the repository root.`

type Command = (io: Io, args: readonly string[]) => Promise<number>

const COMMANDS: Record<string, Command> = {
  init: (io) => initCommand(io),
  start: (io) => startCommand(io),
  scan: (io) => scanCommand(io),
  status: (io) => statusCommand(io),
  run: (io, args) => runCommand(io, args),
  handoff: (io, args) => handoffCommand(io, args),
  setup: (io, args) => setupCommand(io, args, selfInvocation()),
  mcp: (io) => mcpCommand(io, VERSION),
  ingest: (io) => ingestCommand(io),
}

interface GlobalArgs {
  cwd?: string
  help: boolean
  version: boolean
  rest: string[]
}

/** Parses global options up to the command name; the command parses the rest. */
function parseGlobal(argv: readonly string[]): GlobalArgs | { error: string } {
  const parsed: GlobalArgs = { help: false, version: false, rest: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '-h' || token === '--help') parsed.help = true
    else if (token === '-v' || token === '--version') parsed.version = true
    else if (token === '-C' || token === '--cwd') {
      const value = argv[index + 1]
      if (!value) return { error: `${token} needs a directory` }
      parsed.cwd = value
      index += 1
    } else if (token.startsWith('-')) return { error: `Unknown option: ${token}` }
    else {
      parsed.rest = argv.slice(index)
      break
    }
  }
  return parsed
}

/** Commands that stop gracefully on Ctrl-C/SIGTERM; every other command keeps Node's default of exiting at once. */
const INTERRUPTIBLE = new Set(['start', 'run'])

export function handlesInterrupts(argv: readonly string[]): boolean {
  const parsed = parseGlobal(argv)
  return !('error' in parsed) && INTERRUPTIBLE.has(parsed.rest[0] ?? '')
}

function exitCodeFor(error: unknown): number {
  if (error instanceof CommandNotFoundError) return EXIT_NOT_FOUND
  return EXIT_FAILURE
}

function isExpected(error: unknown): error is Error {
  return (
    error instanceof NotAGitRepositoryError ||
    error instanceof NotInitializedError ||
    error instanceof CommandNotFoundError ||
    error instanceof WatchUnavailableError ||
    error instanceof SetupError ||
    error instanceof InvalidHookPayloadError
  )
}

export async function main(argv: readonly string[], io: Io): Promise<number> {
  const parsed = parseGlobal(argv)
  if ('error' in parsed) {
    io.err(`continuum: ${parsed.error}`)
    io.err('Run `continuum --help` for usage.')
    return EXIT_USAGE
  }
  if (parsed.version) {
    io.out(VERSION)
    return EXIT_OK
  }
  const [name, ...args] = parsed.rest
  if (parsed.help || !name) {
    io.out(HELP)
    return parsed.help ? EXIT_OK : EXIT_USAGE
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined
  if (!command) {
    io.err(`continuum: unknown command "${name}". Run \`continuum --help\` for usage.`)
    return EXIT_USAGE
  }
  const scoped: Io = parsed.cwd ? { ...io, cwd: resolve(io.cwd, parsed.cwd) } : io
  try {
    return await command(scoped, args)
  } catch (error) {
    if (isExpected(error)) io.err(`continuum: ${error.message}`)
    else io.err(`continuum: unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
    return exitCodeFor(error)
  }
}
