import { openWorkspace } from '@continuum/capture'
import { forgetPath, forgetSession, forgetTextBefore, InvalidForgetPathError, isStoreBusy, normalizePath, type HistoryRewrite } from '@continuum/store'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const FORGET_USAGE = 'Usage: continuum forget --path <file-or-dir> | --session <id> | --before <YYYY-MM-DD>'

type Scope = 'path' | 'session' | 'before'

function parseForget(args: readonly string[]): { scope: Scope; rewrite: HistoryRewrite; what: string } | { error: string } {
  const [flag, value] = args
  if (args.length !== 2 || !value) return { error: 'say what to forget' }
  if (flag === '--path') {
    try {
      return { scope: 'path', rewrite: forgetPath(normalizePath(value)), what: `everything about ${value}` }
    } catch (error) {
      if (error instanceof InvalidForgetPathError) return { error: error.message }
      throw error
    }
  }
  if (flag === '--session') return { scope: 'session', rewrite: forgetSession(value), what: `session ${value}` }
  if (flag === '--before') {
    const date = new Date(`${value}T00:00:00.000Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) return { error: '--before needs a date like 2026-10-01' }
    return { scope: 'before', rewrite: forgetTextBefore(date), what: `prompts, notes and check output from before ${value}` }
  }
  return { error: `unknown option ${flag}` }
}

/** Permanently removes recorded data. The database file is rewritten so the text is really gone. */
export async function forgetCommand(io: Io, args: readonly string[]): Promise<number> {
  const parsed = parseForget(args)
  if ('error' in parsed) {
    io.err(`continuum: ${parsed.error}`)
    io.err(FORGET_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    if (isStoreBusy(workspace.storePath)) {
      io.err('continuum: another Continuum process is writing to this repository. Stop `continuum start` here, then try again. Nothing was changed.')
      return EXIT_FAILURE
    }
    const { removedEvents, changedEvents, changedCheckpoint } = store.rewriteHistory(parsed.rewrite)
    // Even with nothing matched, old pages may sit in the write-ahead log: always try to clear it.
    if (removedEvents === 0 && changedEvents === 0 && !changedCheckpoint) {
      store.vacuum()
      io.out(`Nothing recorded matches ${parsed.what}.`)
      return EXIT_OK
    }
    store.record({ type: 'data.forgotten', payload: { scope: parsed.scope, removedEvents, changedEvents }, evidence: 'observed', source: 'cli', occurredAt: io.now().toISOString() })
    const { walCleared } = store.vacuum()
    io.out(`Forgot ${parsed.what}: removed ${removedEvents} and rewrote ${changedEvents} records${changedCheckpoint ? ', and the compaction checkpoint' : ''}.`)
    if (!walCleared) {
      io.out('Another process (a hook, `continuum serve` or `start`) has the store open, so old copies may remain in .continuum/context.db-wal.')
      io.out('Close it and run the same forget command again to clear them.')
      return EXIT_FAILURE
    }
    if (parsed.scope === 'path') io.out('If this path is still in the repository, add it to .continuumignore so it is not captured again.')
    return EXIT_OK
  } finally {
    store.close()
  }
}
