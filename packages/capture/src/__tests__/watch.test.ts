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

async function setup(files: Record<string, string> = { 'a.ts': 'a' }, timing: { debounceMs?: number; reconcileMs?: number } = { debounceMs: 20 }) {
  const repo = createSandbox(files)
  const store = ContextStore.open(':memory:')
  const changes: FileChange[] = []
  const errors: unknown[] = []
  sandboxes.push(repo)
  stores.push(store)
  const handle = await startCapture(store, repo.root, {
    ...timing,
    onChanges: (batch) => changes.push(...batch),
    onError: (error) => errors.push(error),
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
})
