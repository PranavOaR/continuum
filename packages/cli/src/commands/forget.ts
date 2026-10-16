import { openWorkspace } from '@continuum/capture'
import { forgetPath, forgetSession, forgetTextBefore, isStoreBusy, normalizePath, type HistoryRewrite } from '@continuum/store'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const FORGET_USAGE = 'Usage: continuum forget --path <file-or-dir> | --session <id> | --before <YYYY-MM-DD>'

type Scope = 'path' | 'session' | 'before'

function parseForget(args: readonly string[]): { scope: Scope; rewrite: HistoryRewrite; what: string } | { error: string } {
  const [flag, value] = args
  if (args.length !== 2 || !value) return { error: 'say what to forget' }
  if (flag === '--path') return { scope: 'path', rewrite: forgetPath(normalizePath(value)), what: `everything about ${value}` }
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
    const { removedEvents, changedEvents } = store.rewriteHistory(parsed.rewrite)
    if (removedEvents === 0 && changedEvents === 0) {
      io.out(`Nothing recorded matches ${parsed.what}.`)
      return EXIT_OK
    }
    store.record({ type: 'data.forgotten', payload: { scope: parsed.scope, removedEvents, changedEvents }, evidence: 'observed', source: 'cli', occurredAt: io.now().toISOString() })
    const vacuumed = store.vacuum()
    io.out(`Forgot ${parsed.what}: removed ${removedEvents} and rewrote ${changedEvents} records.`)
    if (!vacuumed) io.out('Another process is reading the store; the freed space was overwritten but the file will shrink later.')
    if (parsed.scope === 'path') io.out('If this path is still in the repository, add it to .continuumignore so it is not captured again.')
    return EXIT_OK
  } finally {
    store.close()
  }
}
