import { afterEach, describe, expect, it } from 'vitest'
import { ContextStore } from '@continuum/store'
import { loadContinuumIgnore, UnreadableIgnoreFileError } from '../continuumIgnore'
import { uncommittedChanges } from '../diff'
import { isIgnored, readWorkingTree } from '../git'
import { scanRepository } from '../scan'
import { createSandbox, type Sandbox } from '../testing'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

describe('.continuumignore', () => {
  it('keeps listed paths out of the working tree, diffs, commits and the store, even when tracked', async () => {
    const repo = createSandbox({ '.continuumignore': 'secrets/\n*.pem\n!public.pem\n', 'secrets/prod.env': 'TOKEN=1', 'key.pem': 'k', 'public.pem': 'p', 'src/app.ts': 'a' })
    sandboxes.push(repo)
    repo.commit('initial')
    repo.write('secrets/prod.env', 'TOKEN=2')
    repo.write('secrets/new.env', 'TOKEN=3')
    repo.write('src/app.ts', 'a2')

    const tree = await readWorkingTree(repo.root)
    expect([...tree.files.keys()].sort()).toEqual(['.continuumignore', 'public.pem', 'src/app.ts'])
    expect([...(await uncommittedChanges(repo.root)).keys()]).toEqual(['src/app.ts'])
    expect(await isIgnored(repo.root, 'secrets/prod.env')).toBe(true)

    const store = ContextStore.open(':memory:')
    await scanRepository(store, repo.root)
    repo.write('key.pem', 'k2')
    repo.commit('rotate key and update app')
    await scanRepository(store, repo.root)
    const recorded = JSON.stringify([...store.events()])
    expect(recorded).not.toContain('secrets/')
    expect(recorded).not.toContain('key.pem')
    store.close()
  })

  it('ignores nothing when there is no .continuumignore', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    expect((await loadContinuumIgnore(repo.root))('a.ts')).toBe(false)
  })

  it('refuses to capture while a .continuumignore exists but cannot be read', async () => {
    const { mkdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const repo = createSandbox({ 'secrets/prod.env': 'TOKEN=1' })
    sandboxes.push(repo)
    repo.commit('initial')
    // A directory where the file should be: reading it fails on every platform, unlike permissions.
    mkdirSync(join(repo.root, '.continuumignore'))
    await expect(loadContinuumIgnore(repo.root)).rejects.toBeInstanceOf(UnreadableIgnoreFileError)
    const store = ContextStore.open(':memory:')
    try {
      await expect(scanRepository(store, repo.root)).rejects.toBeInstanceOf(UnreadableIgnoreFileError)
      expect(store.eventCount()).toBe(0)
    } finally {
      store.close()
    }
  })
})
