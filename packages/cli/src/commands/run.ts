import { CheckInterruptedError, runCheck } from '@continuum/capture'
import { CHECK_LABELS, formatDuration } from '../format'
import { EXIT_USAGE, type Io } from '../io'
import { applyRepositoryRedactions, openWorkspace } from '@continuum/capture'

export const RUN_USAGE = 'Usage: continuum run [--name <check>] -- <command> [args...]'

export interface RunArgs {
  name?: string
  command: string
  args: string[]
}

/**
 * Splits `[--name x] [--] cmd args...`. Everything from the command onward
 * belongs to the command, so its own flags are never parsed by us.
 */
export function parseRunArgs(argv: readonly string[]): RunArgs | { error: string } {
  let name: string | undefined
  let index = 0
  while (index < argv.length) {
    const token = argv[index]
    if (token === '--') {
      index += 1
      break
    }
    if (token === '--name' || token === '-n') {
      const value = argv[index + 1]
      if (!value || value === '--') return { error: `${token} needs a value` }
      name = value
      index += 2
      continue
    }
    if (token.startsWith('--name=')) {
      name = token.slice('--name='.length)
      index += 1
      continue
    }
    if (token.startsWith('-')) return { error: `Unknown option for run: ${token}` }
    break
  }
  if (name !== undefined && name.trim() === '') return { error: '--name cannot be empty' }
  const [command, ...args] = argv.slice(index)
  if (!command) return { error: 'Missing the command to run' }
  return { name, command, args }
}

export async function runCommand(io: Io, argv: readonly string[]): Promise<number> {
  const parsed = parseRunArgs(argv)
  if ('error' in parsed) {
    io.err(`continuum: ${parsed.error}`)
    io.err(RUN_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    await applyRepositoryRedactions(workspace.root)
    const result = await runCheck(store, { root: workspace.root, ...parsed, stdout: io.stdout, stderr: io.stderr, now: io.now, signal: io.signal })
    io.err(`continuum: recorded "${result.name}" · ${CHECK_LABELS[result.status]} · exit ${result.exitCode} · ${formatDuration(result.durationMs)}`)
    if (result.redactions > 0) io.err(`continuum: masked ${result.redactions} secret${result.redactions === 1 ? '' : 's'} in the command and output before storing them`)
    if (result.warning) io.err(`continuum: warning: ${result.warning}`)
    return result.exitCode
  } catch (error) {
    if (!(error instanceof CheckInterruptedError)) throw error
    io.err(`continuum: ${error.message}`)
    return error.exitCode
  } finally {
    store.close()
  }
}
