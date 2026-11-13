import { scanRepository, SHARED_FILE } from '@continuum/capture'
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
    const { changes, shared } = await scanRepository(store, workspace.root, { now: io.now, attributeToActiveSession: true })
    if (changes.length === 0) io.out('No changes since the last scan.')
    else {
      io.out(`Recorded ${plural(changes.length, 'file change')}:`)
      listChanges(io, changes)
    }
    if (shared.imported > 0) io.out(`Took ${plural(shared.imported, 'shared decision')} from ${SHARED_FILE}.`)
    if (shared.skipped > 0) io.err(`continuum: skipped ${plural(shared.skipped, 'record')} in ${SHARED_FILE} that failed validation.`)
    if (shared.error) io.err(`continuum: ${shared.error}`)
    return EXIT_OK
  } finally {
    store.close()
  }
}
