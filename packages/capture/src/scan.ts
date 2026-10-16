import type { ChangeType, ContentHash, FileChangedEvent } from '@continuum/core'
import type { ContextStore } from '@continuum/store'
import { readWorkingTree, type WorkingTree } from './git'

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

/**
 * Compares the working tree with what the store last recorded and appends one
 * `file.changed` event per difference. Running it twice in a row records nothing new.
 */
export async function scanRepository(store: ContextStore, root: string, options: ScanOptions = {}): Promise<ScanResult> {
  const tree = await readWorkingTree(root)
  const changes = diffSnapshots(recordedFiles(store), tree.files)
  if (changes.length > 0) {
    const occurredAt = (options.now ?? (() => new Date()))().toISOString()
    store.recordAll(changes.map((change) => toEvent(change, occurredAt, tree.revision)))
  }
  return { changes, tree }
}
