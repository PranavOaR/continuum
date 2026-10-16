import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findRepoRoot, hashFiles, headRevision, NotAGitRepositoryError, readWorkingTree } from '../git'
import { createSandbox, type Sandbox } from '../testing'

const sandboxes: Sandbox[] = []
function sandbox(files?: Record<string, string>) {
  const created = createSandbox(files)
  sandboxes.push(created)
  return created
}

afterEach(() => {
  for (const created of sandboxes.splice(0)) created.cleanup()
})

function blobHash(root: string, path: string) {
  return execFileSync('git', ['hash-object', path], { cwd: root, encoding: 'utf8' }).trim()
}

describe('findRepoRoot', () => {
  it('resolves the top level from a nested directory', async () => {
    const repo = sandbox({ 'src/deep/a.ts': 'a' })
    expect(await findRepoRoot(join(repo.root, 'src/deep'))).toBe(repo.root)
  })

  it('throws a clear error outside a git repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'continuum-plain-'))
    try {
      await expect(findRepoRoot(dir)).rejects.toBeInstanceOf(NotAGitRepositoryError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('headRevision', () => {
  it('is null before the first commit and the short sha after it', async () => {
    const repo = sandbox({ 'a.ts': 'a' })
    expect(await headRevision(repo.root)).toBeNull()
    repo.commit()
    expect(await headRevision(repo.root)).toBe(repo.git('rev-parse', '--short', 'HEAD'))
  })
})

describe('readWorkingTree', () => {
  it('hashes tracked and untracked files with git blob hashes', async () => {
    const repo = sandbox({ 'src/a.ts': 'export const a = 1\n', 'README.md': '# hi\n' })
    repo.commit()
    repo.write('src/new.ts', 'new\n')
    const tree = await readWorkingTree(repo.root)
    expect([...tree.files.keys()].sort()).toEqual(['README.md', 'src/a.ts', 'src/new.ts'])
    expect(tree.files.get('src/a.ts')).toBe(blobHash(repo.root, 'src/a.ts'))
    expect(tree.files.get('src/new.ts')).toBe(blobHash(repo.root, 'src/new.ts'))
  })

  it('hashes working-tree content, not the committed version', async () => {
    const repo = sandbox({ 'a.ts': 'one\n' })
    repo.commit()
    const before = (await readWorkingTree(repo.root)).files.get('a.ts')
    repo.write('a.ts', 'two\n')
    const after = (await readWorkingTree(repo.root)).files.get('a.ts')
    expect(after).not.toBe(before)
    expect(after).toBe(blobHash(repo.root, 'a.ts'))
  })

  it('respects .gitignore and never includes Continuum or git internals', async () => {
    const repo = sandbox({ '.gitignore': 'dist/\n', 'dist/out.js': 'x', '.continuum/context.db': 'db', 'a.ts': 'a' })
    const tree = await readWorkingTree(repo.root)
    expect([...tree.files.keys()].sort()).toEqual(['.gitignore', 'a.ts'])
  })

  it('omits tracked files deleted from disk and skips symlinks', async () => {
    const repo = sandbox({ 'a.ts': 'a', 'b.ts': 'b' })
    repo.commit()
    repo.remove('b.ts')
    symlinkSync(join(repo.root, 'a.ts'), join(repo.root, 'link.ts'))
    const tree = await readWorkingTree(repo.root)
    expect([...tree.files.keys()]).toEqual(['a.ts'])
  })

  it('handles paths with spaces and unicode', async () => {
    const repo = sandbox({ 'docs/my notes.md': 'n', 'src/café.ts': 'c' })
    const tree = await readWorkingTree(repo.root)
    expect([...tree.files.keys()].sort()).toEqual(['docs/my notes.md', 'src/café.ts'])
  })

  it('returns an empty tree for an empty repository', async () => {
    const repo = sandbox()
    const tree = await readWorkingTree(repo.root)
    expect(tree.files.size).toBe(0)
    expect(tree.revision).toBeNull()
  })
})

describe('hashFiles', () => {
  it('skips a file that vanished between listing and hashing instead of failing', async () => {
    const repo = sandbox({ 'a.ts': 'a', 'b.ts': 'b' })
    const hashes = await hashFiles(repo.root, ['a.ts', 'gone.ts', 'b.ts'])
    expect([...hashes.keys()]).toEqual(['a.ts', 'b.ts'])
    expect(hashes.get('b.ts')).toBe(blobHash(repo.root, 'b.ts'))
  })
})
