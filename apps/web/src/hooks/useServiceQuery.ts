import { useEffect, useState, useSyncExternalStore } from 'react'
import { NotFoundError } from '@continuum/core'
import { QueryCache } from '../services/queryCache'

export interface QueryState<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
}

/** Live local data goes stale after this long when the daemon cannot push changes. */
export const LIVE_CACHE_TTL_MS = 5_000
/** With pushed changes, a timer refresh is only a safety net (e.g. for edits nothing recorded yet). */
export const PUSHED_CACHE_TTL_MS = 60_000
const MAX_CACHED_QUERIES = 100

// The demo dataset is static, so by default results stay fresh for the whole session.
const cache = new QueryCache({ ttlMs: Number.POSITIVE_INFINITY, maxEntries: MAX_CACHED_QUERIES })

export function setQueryCacheTtl(ttlMs: number): void {
  cache.setTtl(ttlMs)
}

let generation = 0
const generationListeners = new Set<() => void>()

/** New data is available: every mounted query refetches, still showing its current result meanwhile. */
export function invalidateQueries(): void {
  cache.markAllStale()
  generation += 1
  for (const listener of generationListeners) listener()
}

function subscribeGeneration(listener: () => void): () => void {
  generationListeners.add(listener)
  return () => generationListeners.delete(listener)
}

const currentGeneration = () => generation

interface Settled {
  key: string
  error?: Error
  /** Bumped to re-render when a request for this key completes. */
  version: number
}

/**
 * Loads data from the service layer with loading and error states.
 * `key` must uniquely identify the request; the fetcher is only re-run when it changes.
 * Cached data always wins over an error: a failed refresh keeps showing the last good result.
 */
export function useServiceQuery<T>(key: string | null, fetcher: () => Promise<T>): QueryState<T> {
  const [settled, setSettled] = useState<Settled | undefined>(undefined)
  const dataGeneration = useSyncExternalStore(subscribeGeneration, currentGeneration)

  useEffect(() => {
    // A null key means "not ready to ask yet" (e.g. which project is still being resolved).
    if (key === null || cache.isFresh(key)) return
    let isCancelled = false
    cache.load(key, fetcher).then(
      () => {
        if (!isCancelled) setSettled((previous) => ({ key, version: (previous?.version ?? 0) + 1 }))
      },
      (error: unknown) => {
        // Not-found is an expected, user-facing state; anything else is unexpected and worth logging.
        if (!(error instanceof NotFoundError)) console.error(`[continuum] Request "${key}" failed`, error)
        if (!isCancelled) setSettled((previous) => ({ key, error: error instanceof Error ? error : new Error(String(error)), version: (previous?.version ?? 0) + 1 }))
      },
    )
    return () => {
      isCancelled = true
    }
    // The fetcher is intentionally excluded: callers pass inline closures and `key` identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dataGeneration])

  if (key === null) return { data: undefined, error: undefined, isLoading: true }
  if (cache.has(key)) return { data: cache.get<T>(key), error: undefined, isLoading: false }
  const current = settled?.key === key ? settled : undefined
  return { data: undefined, error: current?.error, isLoading: current === undefined }
}
