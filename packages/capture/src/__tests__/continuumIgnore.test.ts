import { afterEach, describe, expect, it } from 'vitest'
import { ContextStore } from '@continuum/store'
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
})
