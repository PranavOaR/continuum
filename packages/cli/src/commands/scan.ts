import { scanRepository } from '@continuum/capture'
import { formatChange, plural } from '../format'
import { EXIT_OK, type Io } from '../io'
import { openWorkspace } from '@continuum/capture'

/** Longest change list printed in full; the rest is summarized. */
export const MAX_LISTED_CHANGES = 20

export function listChanges(io: Io, changes: readonly Parameters<typeof formatChange>[0][]): void {
  for (const change of changes.slice(0, MAX_LISTED_CHANGES)) io.out(`  ${formatChange(change)}`)
  if (changes.length > MAX_LISTED_CHANGES) io.out(`  …and ${changes.length - MAX_LISTED_CHANGES} more`)
}

export async function scanCommand(io: Io): Promise<number> {
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const { changes } = await scanRepository(store, workspace.root, { now: io.now, attributeToActiveSession: true })
    if (changes.length === 0) {
      io.out('No changes since the last scan.')
      return EXIT_OK
    }
    io.out(`Recorded ${plural(changes.length, 'file change')}:`)
    listChanges(io, changes)
    return EXIT_OK
  } finally {
    store.close()
  }
}
