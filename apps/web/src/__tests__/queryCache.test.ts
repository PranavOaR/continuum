import { describe, expect, it } from 'vitest'
import { QueryCache } from '../services/queryCache'

function clock() {
  let now = 0
  return { now: () => now, advance: (ms: number) => (now += ms) }
}

describe('QueryCache', () => {
  it('serves fresh entries without fetching and refreshes stale ones', async () => {
    const time = clock()
    const cache = new QueryCache({ ttlMs: 100, maxEntries: 10, now: time.now })
    let calls = 0
    const fetcher = async () => ++calls
    expect(await cache.load('a', fetcher)).toBe(1)
    expect(await cache.load('a', fetcher)).toBe(1)
    time.advance(150)
    expect(cache.isFresh('a')).toBe(false)
    expect(cache.get('a')).toBe(1)
    expect(await cache.load('a', fetcher)).toBe(2)
  })

  it('shares one request between concurrent callers', async () => {
    const cache = new QueryCache({ ttlMs: 100, maxEntries: 10 })
    let calls = 0
    const fetcher = () => new Promise<number>((resolve) => setTimeout(() => resolve(++calls), 5))
    const results = await Promise.all([cache.load('k', fetcher), cache.load('k', fetcher), cache.load('k', fetcher)])
    expect(results).toEqual([1, 1, 1])
    expect(calls).toBe(1)
  })

  it('keeps the last good result when a refresh fails', async () => {
    const time = clock()
    const cache = new QueryCache({ ttlMs: 10, maxEntries: 10, now: time.now })
    await cache.load('k', async () => 'good')
    time.advance(20)
    await expect(cache.load('k', async () => Promise.reject(new Error('daemon restarting')))).rejects.toThrow('daemon restarting')
    expect(cache.get('k')).toBe('good')
    expect(await cache.load('k', async () => 'recovered')).toBe('recovered')
  })

  it('keeps serving stale results after markAllStale, refreshing each on next use', async () => {
    const cache = new QueryCache({ ttlMs: Number.POSITIVE_INFINITY, maxEntries: 10 })
    await cache.load('a', async () => 1)
    cache.markAllStale()
    expect(cache.isFresh('a')).toBe(false)
    expect(cache.get('a')).toBe(1)
    expect(await cache.load('a', async () => 2)).toBe(2)
    expect(cache.isFresh('a')).toBe(true)
  })

  it('does not treat a request that was in flight during markAllStale as fresh', async () => {
    const cache = new QueryCache({ ttlMs: Number.POSITIVE_INFINITY, maxEntries: 10 })
    let finishOld: (value: number) => void = () => {}
    const old = cache.load('a', () => new Promise<number>((resolve) => (finishOld = resolve)))
    cache.markAllStale()
    const fresh = cache.load('a', async () => 2)
    finishOld(1)
    expect(await old).toBe(1)
    expect(await fresh).toBe(2)
    expect(cache.get('a')).toBe(2)
    expect(cache.isFresh('a')).toBe(true)
  })

  it('evicts the oldest entries beyond its size', async () => {
    const cache = new QueryCache({ ttlMs: 1_000, maxEntries: 2 })
    for (const key of ['a', 'b', 'c']) await cache.load(key, async () => key)
    expect(cache.has('a')).toBe(false)
    expect(cache.has('b') && cache.has('c')).toBe(true)
  })
})
