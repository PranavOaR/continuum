/**
 * Evidence rules, shared by every package. They compare content hashes recorded
 * at the time of an observation with the current hashes, so "out of date" is
 * exact rather than time-based.
 */

/** A stable identity in the context graph, e.g. `file:src/auth/login.ts`. */
export type IdentityKey = string
/** Hex digest of canonical content. */
export type ContentHash = string
export type CurrentHashes = ReadonlyMap<IdentityKey, ContentHash>

export interface RecordedRun {
  exitCode: number
  /** Identity → content hash of everything the run covered, captured when it ran. */
  ranAgainst: Readonly<Record<IdentityKey, ContentHash>>
}

export type CheckStatus = 'passed' | 'failed' | 'out-of-date' | 'unknown' | 'not-run'

function changedSince(recorded: Readonly<Record<IdentityKey, ContentHash>>, current: CurrentHashes): IdentityKey[] {
  return Object.entries(recorded)
    .filter(([key, hash]) => current.get(key) !== hash)
    .map(([key]) => key)
}

export function checkStatus(run: RecordedRun | undefined, current: CurrentHashes): { status: CheckStatus; changed: IdentityKey[] } {
  if (!run) return { status: 'not-run', changed: [] }
  if (Object.keys(run.ranAgainst).length === 0) return { status: 'unknown', changed: [] }
  const changed = changedSince(run.ranAgainst, current)
  if (changed.length > 0) return { status: 'out-of-date', changed }
  return { status: run.exitCode === 0 ? 'passed' : 'failed', changed: [] }
}

export type AnchorStatus = 'current' | 'anchor-changed' | 'unanchored'

/** Whether the code a decision or memory record was anchored to has changed since it was recorded. */
export function anchorStatus(
  anchors: Readonly<Record<IdentityKey, ContentHash>>,
  current: CurrentHashes,
): { status: AnchorStatus; changed: IdentityKey[] } {
  if (Object.keys(anchors).length === 0) return { status: 'unanchored', changed: [] }
  const changed = changedSince(anchors, current)
  return { status: changed.length > 0 ? 'anchor-changed' : 'current', changed }
}
