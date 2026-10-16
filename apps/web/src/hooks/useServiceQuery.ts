import { useEffect, useState } from 'react'
import { NotFoundError } from '@continuum/core'
import { QueryCache } from '../services/queryCache'

export interface QueryState<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
}

/** Live local data goes stale after this long and is refreshed on the next visit. */
export const LIVE_CACHE_TTL_MS = 5_000
const MAX_CACHED_QUERIES = 100

// The demo dataset is static, so by default results stay fresh for the whole session.
const cache = new QueryCache({ ttlMs: Number.POSITIVE_INFINITY, maxEntries: MAX_CACHED_QUERIES })

export function setQueryCacheTtl(ttlMs: number): void {
  cache.setTtl(ttlMs)
}

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
export function useServiceQuery<T>(key: string, fetcher: () => Promise<T>): QueryState<T> {
  const [settled, setSettled] = useState<Settled | undefined>(undefined)

  useEffect(() => {
    if (cache.isFresh(key)) return
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
  }, [key])

  if (cache.has(key)) return { data: cache.get<T>(key), error: undefined, isLoading: false }
  const current = settled?.key === key ? settled : undefined
  return { data: undefined, error: current?.error, isLoading: current === undefined }
}
