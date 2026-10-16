import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPersistentStore, isRecord } from '../services/storage'
import { copyToClipboard } from '../utils/clipboard'

const isNumberBox = (value: unknown): value is { n: number } => isRecord(value) && typeof value.n === 'number'

describe('createPersistentStore', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('round-trips valid values and falls back when empty', () => {
    const store = createPersistentStore('test', { n: 0 }, isNumberBox)
    expect(store.load()).toEqual({ n: 0 })
    store.save({ n: 7 })
    expect(store.load()).toEqual({ n: 7 })
    store.clear()
    expect(store.load()).toEqual({ n: 0 })
  })

  it('falls back on corrupt or invalid stored data', () => {
    const store = createPersistentStore('test', { n: 1 }, isNumberBox)
    window.localStorage.setItem('continuum.demo.v1.test', '{not json')
    expect(store.load()).toEqual({ n: 1 })
    window.localStorage.setItem('continuum.demo.v1.test', JSON.stringify({ n: 'x' }))
    expect(store.load()).toEqual({ n: 1 })
  })

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = createPersistentStore('test', { n: 1 }, isNumberBox)
    expect(() => store.save({ n: 2 })).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})

describe('copyToClipboard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports unavailable clipboard', async () => {
    vi.stubGlobal('navigator', {})
    expect(await copyToClipboard('x')).toEqual({ ok: false, reason: expect.stringContaining('not available') })
  })

  it('reports a denied write', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    expect(await copyToClipboard('x')).toEqual({ ok: false, reason: 'denied' })
  })

  it('succeeds when the write resolves', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyToClipboard('hello')).toEqual({ ok: true })
    expect(writeText).toHaveBeenCalledWith('hello')
  })
})
