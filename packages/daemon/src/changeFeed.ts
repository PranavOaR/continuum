import { openChangeProbe, type ChangeProbe } from '@continuum/store'

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

/**
 * Notices new records in the served repositories (from hooks, `continuum run`,
 * a watcher or an agent) through SQLite's data_version on one read-only
 * connection per store. The dashboard's own reads never register as changes.
 * Nothing runs, and no connection is held, while no dashboard is open.
 */
export function createChangeFeed(stores: readonly WatchedStore[], options: { pollMs?: number; onChange?: ChangeListener } = {}): ChangeFeed {
  const pollMs = options.pollMs ?? CHANGE_POLL_MS
  const listeners = new Set<ChangeListener>()
  const last = new Map<string, number>()
  const probes = new Map<string, ChangeProbe>()

  /** The store's commit counter, or null while it cannot be opened (e.g. the repository was removed). */
  const versionOf = (store: WatchedStore): number | null => {
    try {
      let probe = probes.get(store.projectId)
      if (!probe) {
        probe = openChangeProbe(store.storePath)
        probes.set(store.projectId, probe)
      }
      return probe.version()
    } catch {
      probes.get(store.projectId)?.close()
      probes.delete(store.projectId)
      return null
    }
  }
  let timer: NodeJS.Timeout | undefined
  let checking = false

  const check = () => {
    if (checking) return
    checking = true
    try {
      const changed: string[] = []
      for (const store of stores) {
        const current = versionOf(store)
        if (current === null) continue
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
    for (const probe of probes.values()) probe.close()
    probes.clear()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!timer) {
        check()
        timer = setInterval(check, pollMs)
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
