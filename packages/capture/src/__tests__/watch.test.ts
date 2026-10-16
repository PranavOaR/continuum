import { EventEmitter } from 'node:events'
import { rmSync, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { ContextStore } from '@continuum/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isIgnoredPath, startCapture, type CaptureHandle } from '../watch'
import type { FileChange } from '../scan'
import { createSandbox, type Sandbox } from '../testing'

const sandboxes: Sandbox[] = []
const stores: ContextStore[] = []
const handles: CaptureHandle[] = []

afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.close()
  for (const store of stores.splice(0)) store.close()
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

async function setup(files: Record<string, string> = { 'a.ts': 'a' }, timing: { debounceMs?: number; maxWaitMs?: number; reconcileMs?: number; onError?: (error: unknown) => void } = { debounceMs: 20 }) {
  const repo = createSandbox(files)
  const store = ContextStore.open(':memory:')
  const changes: FileChange[] = []
  const errors: unknown[] = []
  sandboxes.push(repo)
  stores.push(store)
  const handle = await startCapture(store, repo.root, {
    onChanges: (batch) => changes.push(...batch),
    onError: (error) => errors.push(error),
    ...timing,
  })
  handles.push(handle)
  return { repo, store, changes, errors, handle }
}

describe('isIgnoredPath', () => {
  it('ignores git internals, the Continuum store and dependency folders', () => {
    expect(isIgnoredPath('.git/index')).toBe(true)
    expect(isIgnoredPath('.continuum/context.db-wal')).toBe(true)
    expect(isIgnoredPath('node_modules/x/index.js')).toBe(true)
    expect(isIgnoredPath('packages/web/node_modules/x.js')).toBe(true)
    expect(isIgnoredPath('src/a.ts')).toBe(false)
    expect(isIgnoredPath('src/.github-notes.md')).toBe(false)
  })
})

describe('startCapture', () => {
  it('records the initial state before watching', async () => {
    const { changes, store } = await setup({ 'a.ts': 'a', 'b.ts': 'b' })
    expect(changes.map((change) => change.path)).toEqual(['a.ts', 'b.ts'])
    expect(store.eventCount()).toBe(2)
  })

  it('records edits made while running', async () => {
    const { repo, changes } = await setup()
    repo.write('src/new.ts', 'new')
    await vi.waitFor(() => expect(changes.map((change) => change.path)).toContain('src/new.ts'), { timeout: 3000, interval: 25 })
  })

  it('reconciles on a timer, catching changes a watcher event never reported', async () => {
    const { repo, changes } = await setup({ 'a.ts': 'a' }, { debounceMs: 60_000, reconcileMs: 40 })
    repo.write('missed.ts', 'missed')
    await vi.waitFor(() => expect(changes.map((change) => change.path)).toContain('missed.ts'), { timeout: 3000, interval: 25 })
  })

  it('rescans on demand and never runs two scans at once', async () => {
    const { repo, store, handle } = await setup()
    repo.write('b.ts', 'b')
    await Promise.all([handle.rescan(), handle.rescan(), handle.rescan()])
    await handle.idle()
    expect(store.graph.get('file:b.ts')?.hash).toBeTruthy()
    expect([...store.events()].filter((event) => event.type === 'file.changed' && event.payload.path === 'b.ts')).toHaveLength(1)
  })

  it('stops reacting after close', async () => {
    const { repo, store, handle } = await setup()
    await handle.close()
    const before = store.eventCount()
    repo.write('late.ts', 'late')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(store.eventCount()).toBe(before)
  })

  it('scans within the max wait even while a file is rewritten continuously', async () => {
    const { repo, changes } = await setup({ 'a.ts': 'a' }, { debounceMs: 200, maxWaitMs: 300, reconcileMs: 60_000 })
    let tick = 0
    const writer = setInterval(() => repo.write('noisy.log', String(tick++)), 40)
    try {
      await vi.waitFor(() => expect(changes.map((change) => change.path)).toContain('noisy.log'), { timeout: 1500, interval: 25 })
    } finally {
      clearInterval(writer)
    }
  })

  it('rejects instead of pretending to run when the first scan fails', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    const store = ContextStore.open(':memory:')
    store.close()
    await expect(startCapture(store, repo.root, { debounceMs: 20 })).rejects.toThrow()
  })

  it('does not leave a queued rescan rejected when the first scan fails', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    const store = ContextStore.open(':memory:')
    store.close()
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      // A watcher event lands while the first scan is still running and queues a rescan.
      const openWatcher = (_root: string, onPath: (path: string | null) => void) => {
        setTimeout(() => onPath('a.ts'), 0)
        return Object.assign(new EventEmitter(), { close: () => {} }) as unknown as FSWatcher
      }
      await expect(startCapture(store, repo.root, { debounceMs: 1, openWatcher })).rejects.toThrow()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('survives an error reporter that itself throws', async () => {
    const { repo, handle } = await setup({ 'a.ts': 'a' }, {
      debounceMs: 20,
      onError: () => {
        throw new Error('stderr is closed')
      },
    })
    rmSync(join(repo.root, '.git'), { recursive: true, force: true })
    await expect(handle.rescan()).resolves.toBeUndefined()
  })
})

describe('startCapture without watch capacity', () => {
  const failure = (code: string) => Object.assign(new Error(`watch failed: ${code}`), { code })

  async function pollingSetup(openWatcher: NonNullable<Parameters<typeof startCapture>[2]>['openWatcher']) {
    const repo = createSandbox({ 'a.ts': 'a' })
    const store = ContextStore.open(':memory:')
    sandboxes.push(repo)
    stores.push(store)
    const reasons: string[] = []
    const changes: FileChange[] = []
    const handle = await startCapture(store, repo.root, { pollMs: 30, openWatcher, onPolling: (reason) => reasons.push(reason), onChanges: (batch) => changes.push(...batch) })
    handles.push(handle)
    return { repo, handle, reasons, changes }
  }

  it('falls back to polling when the OS is out of watches, and still records edits', async () => {
    const { repo, handle, reasons, changes } = await pollingSetup(() => {
      throw failure('ENOSPC')
    })
    expect(handle.mode).toBe('polling')
    expect(reasons).toEqual(['watch failed: ENOSPC'])
    repo.write('b.ts', 'b')
    await vi.waitFor(() => expect(changes.map((change) => change.path)).toContain('b.ts'), { timeout: 2000 })
  })

  it('switches to polling when a running watcher runs out of capacity', async () => {
    const { EventEmitter } = await import('node:events')
    const fake = Object.assign(new EventEmitter(), { close: () => {} }) as unknown as import('node:fs').FSWatcher
    const { handle, reasons } = await pollingSetup(() => fake)
    expect(handle.mode).toBe('watching')
    fake.emit('error', failure('ENOSPC'))
    expect(handle.mode).toBe('polling')
    expect(reasons).toHaveLength(1)
  })

  it('still refuses to start for errors polling cannot work around', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    const store = ContextStore.open(':memory:')
    stores.push(store)
    await expect(
      startCapture(store, repo.root, {
        openWatcher: () => {
          throw failure('EACCES')
        },
      }),
    ).rejects.toThrow(/Cannot watch/)
  })
})
