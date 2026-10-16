import { initWorkspace } from '@continuum/capture'
import { removeClaudeCodeSetup, setupClaudeCode, type Invocation, type SetupResult } from '@continuum/claude-code'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const SETUP_USAGE = 'Usage: continuum setup claude-code [--remove]'

function report(io: Io, result: SetupResult): void {
  for (const file of result.files) io.out(`  ${file.action.padEnd(9)} ${file.path}`)
}

/** Connects (or disconnects) Claude Code to Continuum for this repository only. */
export async function setupCommand(io: Io, args: readonly string[], invocation: Invocation): Promise<number> {
  const [target, ...flags] = args
  const remove = flags.length === 1 && flags[0] === '--remove'
  if (target !== 'claude-code' || (flags.length > 0 && !remove)) {
    io.err(`continuum: ${target ? `unsupported setup target or option: ${args.join(' ')}` : 'missing setup target'}`)
    io.err(SETUP_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store, created } = await initWorkspace(io.cwd)
  store.close()
  if (remove) {
    const result = await removeClaudeCodeSetup(workspace.root)
    io.out(result.files.length === 0 ? 'Claude Code was not set up here; nothing to remove.' : 'Removed Continuum from Claude Code for this repository:')
    report(io, result)
    return EXIT_OK
  }
  const result = await setupClaudeCode(workspace.root, invocation)
  io.out(`Connected Claude Code to Continuum in ${workspace.root}${created ? ' (and initialized Continuum)' : ''}:`)
  report(io, result)
  io.out('')
  io.out('Next: start (or restart) Claude Code in this repository and approve the "continuum" MCP server.')
  io.out('New sessions are briefed on where the last one left off; edits and progress are recorded as you work.')
  io.out('These files point at this checkout of Continuum, so they are kept out of git.')
  return EXIT_OK
}
