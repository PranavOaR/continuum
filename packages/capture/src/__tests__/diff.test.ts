import { afterEach, describe, expect, it } from 'vitest'
import { MAX_EXCERPT_LINES, uncommittedChanges } from '../diff'
import { createSandbox, type Sandbox } from '../testing'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function repo(files: Record<string, string>) {
  const created = createSandbox(files)
  sandboxes.push(created)
  return created
}

describe('uncommittedChanges', () => {
  it('counts lines and keeps an excerpt for modified, deleted and untracked files', async () => {
    const created = repo({ 'src/app.ts': 'const a = 1\nconst b = 2\n', 'old.ts': 'gone\n', 'same.ts': 'same\n' })
    created.commit('initial')
    created.write('src/app.ts', 'const a = 1\nconst b = 3\nconst c = 4\n')
    created.remove('old.ts')
    created.write('new file.ts', 'one\ntwo\n')

    const diffs = await uncommittedChanges(created.root)
    expect(diffs.get('src/app.ts')).toMatchObject({ additions: 2, deletions: 1 })
    expect(diffs.get('src/app.ts')?.excerpt).toEqual([
      { kind: 'context', text: 'const a = 1' },
      { kind: 'remove', text: 'const b = 2' },
      { kind: 'add', text: 'const b = 3' },
      { kind: 'add', text: 'const c = 4' },
    ])
    expect(diffs.get('old.ts')).toMatchObject({ additions: 0, deletions: 1, excerpt: [{ kind: 'remove', text: 'gone' }] })
    expect(diffs.get('new file.ts')).toMatchObject({ additions: 2, deletions: 0 })
    expect(diffs.has('same.ts')).toBe(false)
  })

  it('works before the first commit and reports binary files without line counts', async () => {
    const created = repo({ 'a.ts': 'x\n' })
    created.write('image.bin', 'PNG\u0000\u0001data')
    const diffs = await uncommittedChanges(created.root)
    expect(diffs.get('a.ts')).toMatchObject({ additions: 1, deletions: 0 })
    expect(diffs.get('image.bin')).toMatchObject({ additions: null, deletions: null, excerpt: [] })
  })

  it('bounds the excerpt of a large change', async () => {
    const created = repo({ 'big.ts': '' })
    created.commit('initial')
    created.write('big.ts', Array.from({ length: 500 }, (_, index) => `line ${index}`).join('\n'))
    const diff = (await uncommittedChanges(created.root)).get('big.ts')
    expect(diff?.additions).toBe(500)
    expect(diff?.excerpt).toHaveLength(MAX_EXCERPT_LINES)
    expect(diff?.truncated).toBe(true)
  })
})
