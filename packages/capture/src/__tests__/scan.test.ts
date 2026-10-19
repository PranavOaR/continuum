import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ContextStore } from '@continuum/store'
import { afterEach, describe, expect, it } from 'vitest'
import { diffSnapshots, recordedFiles, scanRepository } from '../scan'
import { createSandbox, type Sandbox } from '../testing'

const sandboxes: Sandbox[] = []
const stores: ContextStore[] = []
function setup(files?: Record<string, string>) {
  const repo = createSandbox(files)
  const store = ContextStore.open(':memory:')
  sandboxes.push(repo)
  stores.push(store)
  return { repo, store }
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

const fixedNow = () => new Date('2026-10-16T10:00:00.000Z')

describe('diffSnapshots', () => {
  it('reports added, modified and deleted paths in path order', () => {
    const previous = new Map([['a.ts', 'h1'], ['b.ts', 'h2'], ['c.ts', 'h3']])
    const next = new Map([['a.ts', 'h1'], ['b.ts', 'h2-new'], ['d.ts', 'h4']])
    expect(diffSnapshots(previous, next)).toEqual([
      { path: 'b.ts', changeType: 'modified', contentHash: 'h2-new' },
      { path: 'c.ts', changeType: 'deleted', contentHash: null },
      { path: 'd.ts', changeType: 'added', contentHash: 'h4' },
    ])
  })

  it('returns nothing for identical snapshots', () => {
    const snapshot = new Map([['a.ts', 'h1']])
    expect(diffSnapshots(snapshot, new Map(snapshot))).toEqual([])
  })
})

describe('scanRepository', () => {
  it('records every file as added on the first scan', async () => {
    const { repo, store } = setup({ 'src/a.ts': 'a', 'README.md': 'r' })
    const result = await scanRepository(store, repo.root, { now: fixedNow })
    expect(result.changes.map((change) => `${change.changeType} ${change.path}`)).toEqual(['added README.md', 'added src/a.ts'])
    expect(store.eventCount()).toBe(2)
    expect([...recordedFiles(store).keys()].sort()).toEqual(['README.md', 'src/a.ts'])
  })

  it('records observed file events with the source, time and revision', async () => {
    const { repo, store } = setup({ 'a.ts': 'a' })
    repo.commit()
    await scanRepository(store, repo.root, { now: fixedNow })
    const event = [...store.events()].find((recorded) => recorded.type === 'file.changed')
    expect(event).toMatchObject({
      type: 'file.changed',
      evidence: 'observed',
      source: 'watcher:git',
      occurredAt: '2026-10-16T10:00:00.000Z',
      revision: repo.git('rev-parse', '--short', 'HEAD'),
    })
  })

  // When the commit was made, from git: a scan may notice it long after.
  const ISO_TIME = expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)

  it('records the existing HEAD once as a baseline, then each new commit with its files and time', async () => {
    const { repo, store } = setup({ 'a.ts': 'a' })
    repo.commit('initial')
    await scanRepository(store, repo.root)
    repo.write('b.ts', 'b')
    repo.commit('add b')
    repo.write('a.ts', 'a2')
    repo.commit('change a')
    await scanRepository(store, repo.root)
    await scanRepository(store, repo.root)
    const commits = [...store.events()].filter((event) => event.type === 'commit.recorded').map((event) => event.payload)
    expect(commits).toEqual([
      { hash: expect.any(String), message: 'initial', files: ['a.ts'], committedAt: ISO_TIME, baseline: true },
      { hash: expect.any(String), message: 'add b', files: ['b.ts'], committedAt: ISO_TIME },
      { hash: expect.any(String), message: 'change a', files: ['a.ts'], committedAt: ISO_TIME },
    ])
  })

  it('lists the files a merge brought in', async () => {
    const { repo, store } = setup({ 'a.ts': 'a' })
    repo.commit('initial')
    await scanRepository(store, repo.root)
    repo.git('checkout', '-q', '-b', 'feature')
    repo.write('feature.ts', 'f')
    repo.commit('feature work')
    repo.git('checkout', '-q', 'main')
    repo.write('main.ts', 'm')
    repo.commit('main work')
    repo.git('merge', '-q', '--no-ff', '-m', 'Merge feature', 'feature')
    await scanRepository(store, repo.root)
    const merge = [...store.events()].find((event) => event.type === 'commit.recorded' && event.payload.message === 'Merge feature')
    expect(merge?.type === 'commit.recorded' && merge.payload.files).toEqual(['feature.ts'])
  })

  it('records where HEAD went after a reset, once, without calling it new work', async () => {
    const { repo, store } = setup({ 'a.ts': 'a' })
    repo.commit('first')
    repo.write('a.ts', 'a2')
    repo.commit('second')
    await scanRepository(store, repo.root)
    repo.git('reset', '-q', '--hard', 'HEAD~1')
    await scanRepository(store, repo.root)
    const before = store.eventCount()
    await scanRepository(store, repo.root)
    expect(store.eventCount()).toBe(before)
    const last = [...store.events()].filter((event) => event.type === 'commit.recorded').at(-1)
    expect(last?.type === 'commit.recorded' && last.payload).toMatchObject({ message: 'first', baseline: true })
  })

  it('records nothing about commits in a repository without any', async () => {
    const { repo, store } = setup({ 'a.ts': 'a' })
    await scanRepository(store, repo.root)
    expect([...store.events()].some((event) => event.type === 'commit.recorded')).toBe(false)
  })

  it('is idempotent when nothing changed', async () => {
    const { repo, store } = setup({ 'a.ts': 'a' })
    await scanRepository(store, repo.root)
    const second = await scanRepository(store, repo.root)
    expect(second.changes).toEqual([])
    expect(store.eventCount()).toBe(1)
  })

  it('records only what changed since the last scan, including deletions', async () => {
    const { repo, store } = setup({ 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' })
    await scanRepository(store, repo.root)
    repo.write('a.ts', 'a2')
    repo.remove('b.ts')
    repo.write('d.ts', 'd')
    const result = await scanRepository(store, repo.root)
    expect(result.changes.map((change) => `${change.changeType} ${change.path}`)).toEqual(['modified a.ts', 'deleted b.ts', 'added d.ts'])
    expect(store.graph.get('file:b.ts')?.hash).toBeNull()
    expect(recordedFiles(store).has('b.ts')).toBe(false)
  })

  it('does not re-report a deleted file on later scans', async () => {
    const { repo, store } = setup({ 'a.ts': 'a', 'b.ts': 'b' })
    await scanRepository(store, repo.root)
    repo.remove('b.ts')
    await scanRepository(store, repo.root)
    expect((await scanRepository(store, repo.root)).changes).toEqual([])
  })

  it('reports a recreated file as added again', async () => {
    const { repo, store } = setup({ 'a.ts': 'a' })
    await scanRepository(store, repo.root)
    repo.remove('a.ts')
    await scanRepository(store, repo.root)
    repo.write('a.ts', 'back')
    expect((await scanRepository(store, repo.root)).changes).toEqual([
      expect.objectContaining({ path: 'a.ts', changeType: 'added' }),
    ])
  })

  it('does not re-record changes another process already recorded', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    const dir = mkdtempSync(join(tmpdir(), 'continuum-shared-'))
    const watcher = ContextStore.open(join(dir, 'context.db'))
    const cli = ContextStore.open(join(dir, 'context.db'))
    stores.push(watcher, cli)
    try {
      await scanRepository(watcher, repo.root)
      repo.write('a.ts', 'a2')
      expect((await scanRepository(cli, repo.root)).changes).toHaveLength(1)
      expect((await scanRepository(watcher, repo.root)).changes).toEqual([])
      expect(watcher.eventCount()).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('makes recorded check runs go out of date when a covered file changes', async () => {
    const { repo, store } = setup({ 'a.ts': 'a' })
    const { tree } = await scanRepository(store, repo.root)
    store.record({
      type: 'check.recorded',
      payload: { name: 'npm test', command: 'npm test', exitCode: 0, durationMs: 5, ranAgainst: { 'file:a.ts': tree.files.get('a.ts') as string } },
      evidence: 'verified',
      source: 'test',
      occurredAt: fixedNow().toISOString(),
    })
    expect(store.checkStatus('npm test').status).toBe('passed')
    repo.write('a.ts', 'changed')
    await scanRepository(store, repo.root)
    expect(store.checkStatus('npm test')).toEqual({ status: 'out-of-date', changed: ['file:a.ts'] })
  })
})
