import { useEffect, useState } from 'react'
import { NotFoundError } from '@continuum/core'

export interface QueryState<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
}

// The mock dataset is static, so results can be cached for the session to keep navigation instant.
const cache = new Map<string, unknown>()

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
    if (cache.has(key)) return
    let isCancelled = false
    fetcher().then(
      (data) => {
        cache.set(key, data)
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

  if (cache.has(key)) return { data: cache.get(key) as T, error: undefined, isLoading: false }
  const current = settled?.key === key ? settled : undefined
  return { data: current?.data, error: current?.error, isLoading: current === undefined }
}
