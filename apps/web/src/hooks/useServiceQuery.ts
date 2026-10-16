import { useEffect, useState } from 'react'
import { NotFoundError } from '@continuum/core'

export interface QueryState<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
}

// The demo dataset is static, so results are cached for the session to keep navigation instant.
// Live local data changes, so entries then go stale after a few seconds and are refetched
// on the next visit, while the stale copy keeps showing (stale-while-revalidate).
const cache = new Map<string, { data: unknown; at: number }>()
let cacheTtlMs = Number.POSITIVE_INFINITY

export const LIVE_CACHE_TTL_MS = 5_000

export function setQueryCacheTtl(ttlMs: number): void {
  cacheTtlMs = ttlMs
}

const isFresh = (key: string) => {
  const entry = cache.get(key)
  return entry !== undefined && Date.now() - entry.at < cacheTtlMs
}

interface Settled<T> {
  key: string
  data?: T
  error?: Error
}

/**
 * Loads data from the service layer with loading and error states.
 * `key` must uniquely identify the request; the fetcher is only re-run when it changes.
 */
export function useServiceQuery<T>(key: string, fetcher: () => Promise<T>): QueryState<T> {
  const [settled, setSettled] = useState<Settled<T> | undefined>(undefined)

  useEffect(() => {
    if (isFresh(key)) return
    let isCancelled = false
    fetcher().then(
      (data) => {
        cache.set(key, { data, at: Date.now() })
        if (!isCancelled) setSettled({ key, data })
      },
      (error: unknown) => {
        // Not-found is an expected, user-facing state; anything else is unexpected and worth logging.
        if (!(error instanceof NotFoundError)) console.error(`[continuum] Request "${key}" failed`, error)
        if (!isCancelled) setSettled({ key, error: error instanceof Error ? error : new Error(String(error)) })
      },
    )
    return () => {
      isCancelled = true
    }
    // The fetcher is intentionally excluded: callers pass inline closures and `key` identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const current = settled?.key === key ? settled : undefined
  const cached = cache.get(key)
  if (cached && !current?.error) return { data: (current?.data ?? cached.data) as T, error: undefined, isLoading: false }
  return { data: current?.data, error: current?.error, isLoading: current === undefined }
}
