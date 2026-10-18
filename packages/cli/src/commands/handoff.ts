import { openWorkspace, readWorkingTreeWithSymbols } from '@continuum/capture'
import { DEFAULT_HANDOFF_CHARS, projectState, renderHandoff } from '@continuum/context'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const HANDOFF_USAGE = 'Usage: continuum handoff [--max-chars <n>]'
const MIN_CHARS = 500

function parseMaxChars(args: readonly string[]): number | { error: string } {
  if (args.length === 0) return DEFAULT_HANDOFF_CHARS
  const [flag, value, ...rest] = args
  if (flag !== '--max-chars' || rest.length > 0) return { error: `Unexpected arguments: ${args.join(' ')}` }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < MIN_CHARS) return { error: `--max-chars must be a whole number of at least ${MIN_CHARS}` }
  return parsed
}

/** Prints the same briefing agents get, for pasting into any tool. */
export async function handoffCommand(io: Io, args: readonly string[]): Promise<number> {
  const maxChars = parseMaxChars(args)
  if (typeof maxChars !== 'number') {
    io.err(`continuum: ${maxChars.error}`)
    io.err(HANDOFF_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const now = io.now()
    io.out(renderHandoff(projectState(store, await readWorkingTreeWithSymbols(store, workspace.root), now), { now, maxChars }))
    return EXIT_OK
  } finally {
    store.close()
  }
}
