interface Entry {
  data: unknown
  at: number
  /** The invalidation epoch the request that produced this entry started in. */
  epoch: number
}

export interface QueryCacheOptions {
  ttlMs: number
  maxEntries: number
  now?: () => number
}

/**
 * Results by key with stale-while-revalidate semantics:
 * - fresh entries are served without a request
 * - stale entries are still served while one shared request refreshes them
 * - a failed refresh keeps the stale entry (the failure is reported to the caller)
 * - the oldest entries are evicted beyond `maxEntries` (search adds a key per query)
 */
export class QueryCache {
  private readonly entries = new Map<string, Entry>()
  private readonly inflight = new Map<string, Promise<unknown>>()
  /** Bumped by markAllStale; a request started before the bump cannot produce a fresh entry. */
  private epoch = 0
  private ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(options: QueryCacheOptions) {
    this.ttlMs = options.ttlMs
    this.maxEntries = options.maxEntries
    this.now = options.now ?? Date.now
  }

  setTtl(ttlMs: number): void {
    this.ttlMs = ttlMs
  }

  /** Keeps every result for display but refetches each on its next use (stale-while-revalidate). */
  markAllStale(): void {
    for (const [key, entry] of this.entries) this.entries.set(key, { ...entry, at: Number.NEGATIVE_INFINITY })
    // Requests in flight may have read before the change: later callers start new ones.
    this.inflight.clear()
    this.epoch += 1
  }

  has(key: string): boolean {
    return this.entries.has(key)
  }

  get<T>(key: string): T | undefined {
    return this.entries.get(key)?.data as T | undefined
  }

  isFresh(key: string): boolean {
    const entry = this.entries.get(key)
    return entry !== undefined && this.now() - entry.at < this.ttlMs
  }

  /** Fetches unless fresh; concurrent callers for one key share a single request. */
  load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this.isFresh(key)) return Promise.resolve(this.get<T>(key) as T)
    const pending = this.inflight.get(key)
    if (pending) return pending as Promise<T>
    const startedIn = this.epoch
    const request = fetcher()
      .then((data) => {
        this.set(key, data, startedIn)
        return data
      })
      .finally(() => {
        if (this.inflight.get(key) === request) this.inflight.delete(key)
      })
    this.inflight.set(key, request)
    return request
  }

  private set(key: string, data: unknown, startedIn: number): void {
    // A slow request from before an invalidation never replaces a result read after it.
    const existing = this.entries.get(key)
    if (existing && existing.epoch > startedIn) return
    this.entries.delete(key)
    this.entries.set(key, { data, at: startedIn === this.epoch ? this.now() : Number.NEGATIVE_INFINITY, epoch: startedIn })
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string
      this.entries.delete(oldest)
    }
  }
}
