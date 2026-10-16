import { stat } from 'node:fs/promises'

/** How often a connected dashboard's repositories are checked for new records. */
export const CHANGE_POLL_MS = 750

export interface WatchedStore {
  projectId: string
  /** The repository's context.db; SQLite also writes `-wal` next to it. */
  storePath: string
}

export type ChangeListener = (projectIds: string[]) => void

export interface ChangeFeed {
  /** Starts polling with the first subscriber and stops with the last. Returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void
  close(): void
}

/** Size and modification time of the store and its write-ahead log: changes whenever anything is recorded. */
async function fingerprint(storePath: string): Promise<string> {
  const parts = await Promise.all(
    [storePath, `${storePath}-wal`].map(async (path) => {
      try {
        const info = await stat(path)
        return `${info.size}:${info.mtimeMs}`
      } catch {
        return 'missing'
      }
    }),
  )
  return parts.join('|')
}

/**
 * Notices new records in the served repositories (from hooks, `continuum run`,
 * a watcher or an agent) by polling file metadata only: no database reads
 * and nothing at all while no dashboard is open.
 */
export function createChangeFeed(stores: readonly WatchedStore[], options: { pollMs?: number; onChange?: ChangeListener } = {}): ChangeFeed {
  const pollMs = options.pollMs ?? CHANGE_POLL_MS
  const listeners = new Set<ChangeListener>()
  const last = new Map<string, string>()
  let timer: NodeJS.Timeout | undefined
  let checking = false

  const check = async () => {
    if (checking) return
    checking = true
    try {
      const changed: string[] = []
      for (const store of stores) {
        const current = await fingerprint(store.storePath)
        if (last.has(store.projectId) && last.get(store.projectId) !== current) changed.push(store.projectId)
        last.set(store.projectId, current)
      }
      if (changed.length === 0) return
      // Before listeners, so whatever they trigger (a dashboard refetch) reads the new records.
      options.onChange?.(changed)
      for (const listener of listeners) listener(changed)
    } finally {
      checking = false
    }
  }

  const stop = () => {
    clearInterval(timer)
    timer = undefined
    last.clear()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!timer) {
        void check()
        timer = setInterval(() => void check(), pollMs)
        timer.unref()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    close() {
      listeners.clear()
      stop()
    },
  }
}
