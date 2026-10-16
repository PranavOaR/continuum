import { statSync } from 'node:fs'
import { openWorkspace } from '@continuum/capture'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const COMPACT_USAGE = 'Usage: continuum compact [--keep-days <n>]'
/** Recent history stays in the log as individual events: the activity feed and handoffs read it. */
export const DEFAULT_KEEP_DAYS = 30
const DAY_MS = 86_400_000
const MAX_KEEP_DAYS = 36_500

function parseKeepDays(args: readonly string[]): number | { error: string } {
  if (args.length === 0) return DEFAULT_KEEP_DAYS
  const days = Number(args[1])
  if (args.length !== 2 || args[0] !== '--keep-days' || !Number.isInteger(days) || days < 0 || days > MAX_KEEP_DAYS) {
    return { error: '--keep-days needs a whole number of days' }
  }
  return days
}

function storeBytes(path: string): number {
  return [path, `${path}-wal`].reduce((total, file) => {
    try {
      return total + statSync(file).size
    } catch {
      return total
    }
  }, 0)
}

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`

/** Folds old events into a checkpoint so the store stops growing with history. Current state is unchanged. */
export async function compactCommand(io: Io, args: readonly string[]): Promise<number> {
  const keepDays = parseKeepDays(args)
  if (typeof keepDays !== 'number') {
    io.err(`continuum: ${keepDays.error}`)
    io.err(COMPACT_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const before = storeBytes(workspace.storePath)
    const cutoff = new Date(io.now().getTime() - keepDays * DAY_MS)
    const { removedEvents } = store.compact(cutoff, io.now())
    if (removedEvents === 0) {
      io.out(`Nothing to compact: no events older than ${keepDays} day${keepDays === 1 ? '' : 's'}.`)
      return EXIT_OK
    }
    const shrunk = store.vacuum()
    io.out(`Folded ${removedEvents} event${removedEvents === 1 ? '' : 's'} from before ${cutoff.toISOString().slice(0, 10)} into a checkpoint.`)
    io.out(`Store: ${megabytes(before)} → ${megabytes(storeBytes(workspace.storePath))}${shrunk ? '' : ' (another process is reading it; the freed space will be reused instead)'}.`)
    io.out('Current tasks, checks and decisions are unchanged; older activity no longer appears in the feed.')
    return EXIT_OK
  } finally {
    store.close()
  }
}
