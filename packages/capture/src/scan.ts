import type { ChangeType, ContentHash, ContinuumEvent, FileChangedEvent } from '@continuum/core'
import type { ContextStore } from '@continuum/store'
import { commitsSince, recordedHead, type CommitInfo } from './commits'
import { readWorkingTree, type WorkingTree } from './git'
import { redactSecrets } from './redact'

export const SCAN_SOURCE = 'watcher:git'

const FILE_KEY_PREFIX = 'file:'

export interface FileChange {
  path: string
  changeType: ChangeType
  contentHash: ContentHash | null
}

export interface ScanResult {
  changes: FileChange[]
  tree: WorkingTree
}

export interface ScanOptions {
  now?: () => Date
}

/** Pure diff of two path → hash snapshots, sorted by path. */
export function diffSnapshots(previous: ReadonlyMap<string, ContentHash>, next: ReadonlyMap<string, ContentHash>): FileChange[] {
  const paths = [...new Set([...previous.keys(), ...next.keys()])].sort()
  return paths.flatMap((path): FileChange[] => {
    const before = previous.get(path)
    const after = next.get(path)
    if (before === after) return []
    if (after === undefined) return [{ path, changeType: 'deleted', contentHash: null }]
    return [{ path, changeType: before === undefined ? 'added' : 'modified', contentHash: after }]
  })
}

/** Files the store currently believes exist, with their last recorded hash. */
export function recordedFiles(store: ContextStore): Map<string, ContentHash> {
  const files = new Map<string, ContentHash>()
  for (const key of store.graph.keysOfKind('file')) {
    const hash = store.graph.get(key)?.hash
    if (hash) files.set(key.slice(FILE_KEY_PREFIX.length), hash)
  }
  return files
}

function toEvent(change: FileChange, occurredAt: string, revision: string | null): FileChangedEvent {
  return {
    type: 'file.changed',
    payload: change,
    evidence: 'observed',
    source: SCAN_SOURCE,
    occurredAt,
    ...(revision ? { revision } : {}),
  }
}

function commitEvent(commit: CommitInfo, occurredAt: string, isBaseline: boolean): ContinuumEvent {
  return {
    type: 'commit.recorded',
    payload: { hash: commit.hash, message: redactSecrets(commit.message), files: commit.files, ...(isBaseline ? { baseline: true } : {}) },
    evidence: 'observed',
    source: SCAN_SOURCE,
    occurredAt,
    revision: commit.hash,
  }
}

/**
 * Compares the working tree with what the store last recorded and appends one
 * `file.changed` event per difference. Running it twice in a row records nothing new.
 */
export async function scanRepository(store: ContextStore, root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const tree = await readWorkingTree(root)
  const occurredAt = (options.now ?? (() => new Date()))().toISOString()
  const previousHead = recordedHead(store)
  // tree.revision is abbreviated; the recorded head is the full hash.
  const headMoved = tree.revision !== null && !previousHead?.startsWith(tree.revision)
  const found = headMoved && tree.revision ? await commitsSince(root, tree.revision, previousHead) : []
  // HEAD moved back (reset, checkout of an older commit): no new commits, but record where HEAD is now,
  // or every later scan would look for new commits again.
  const commits = headMoved && found.length === 0 && tree.revision ? await commitsSince(root, tree.revision, null) : found
  let changes: FileChange[] = []
  // Diff inside the transaction: another process may have recorded some of these changes already.
  store.transact(() => {
    changes = diffSnapshots(recordedFiles(store), tree.files)
    // Only the process that still sees the old HEAD records the new commits.
    const commitEvents = recordedHead(store) === previousHead ? [...commits].reverse().map((commit) => commitEvent(commit, occurredAt, previousHead === null || found.length === 0)) : []
    return [...commitEvents, ...changes.map((change) => toEvent(change, occurredAt, tree.revision))]
  })
  return { changes, tree }
}
