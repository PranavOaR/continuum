import { execFileSync } from 'node:child_process'
import { chmodSync, lstatSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readWorkingTree } from '../git'
import { createSandbox, type Sandbox } from '../testing'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const created of sandboxes.splice(0)) created.cleanup()
})

/** The straightforward definition: list every candidate file and hash each from disk. */
function hashEverything(root: string): Map<string, string> {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  const paths = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))]
    .filter((path) => !path.startsWith('.continuum/'))
    .filter((path) => {
      try {
        return lstatSync(join(root, path)).isFile()
      } catch {
        return false
      }
    })
    .sort()
  if (paths.length === 0) return new Map()
  const output = execFileSync('git', ['hash-object', '--stdin-paths'], { cwd: root, input: `${paths.join('\n')}\n`, encoding: 'utf8' }).trim().split('\n')
  return new Map(paths.map((path, index) => [path, output[index]]))
}

describe('readWorkingTree takes clean files from the index', () => {
  it('matches hashing every file across modified, staged, renamed, deleted, untracked and ignored files', async () => {
    const repo = createSandbox({
      'clean.ts': 'clean\n',
      'modified.ts': 'v1\n',
      'staged-then-edited.ts': 'v1\n',
      'deleted.ts': 'gone soon\n',
      'renamed-from.ts': 'moving\n',
      'dir with space/file name.ts': 'spaces\n',
      'ünïcode.ts': 'unicode\n',
      'tool.sh': '#!/bin/sh\n',
      '.gitignore': 'build/\n*.log\n',
    })
    sandboxes.push(repo)
    chmodSync(join(repo.root, 'tool.sh'), 0o755)
    symlinkSync('clean.ts', join(repo.root, 'link.ts'))
    repo.commit('initial')

    repo.write('modified.ts', 'v2\n')
    repo.write('staged-then-edited.ts', 'v2\n')
    repo.git('add', 'staged-then-edited.ts')
    repo.write('staged-then-edited.ts', 'v3\n')
    repo.remove('deleted.ts')
    repo.git('mv', 'renamed-from.ts', 'renamed-to.ts')
    repo.write('untracked/new.ts', 'new\n')
    repo.write('build/out.js', 'ignored\n')
    repo.write('debug.log', 'ignored\n')
    repo.write('.continuum/context.db', 'never captured\n')
    repo.write('staged-new.ts', 'added\n')
    repo.git('add', 'staged-new.ts')

    const tree = await readWorkingTree(repo.root)
    expect([...tree.files]).toEqual([...hashEverything(repo.root)])
    expect(tree.files.has('link.ts')).toBe(false)
    expect(tree.files.has('deleted.ts')).toBe(false)
  })

  it('hashes both sides of a merge conflict from disk', async () => {
    const repo = createSandbox({ 'shared.ts': 'base\n' })
    sandboxes.push(repo)
    repo.commit('base')
    repo.git('checkout', '-q', '-b', 'other')
    repo.write('shared.ts', 'theirs\n')
    repo.commit('theirs')
    repo.git('checkout', '-q', 'main')
    repo.write('shared.ts', 'ours\n')
    repo.commit('ours')
    expect(() => repo.git('merge', '-q', 'other')).toThrow()

    const tree = await readWorkingTree(repo.root)
    expect([...tree.files]).toEqual([...hashEverything(repo.root)])
  })

  it('notices an edit that keeps the file size and timestamp-second', async () => {
    const repo = createSandbox({ 'same-size.ts': 'aaaa\n' })
    sandboxes.push(repo)
    repo.commit('initial')
    repo.write('same-size.ts', 'bbbb\n')
    const tree = await readWorkingTree(repo.root)
    expect(tree.files.get('same-size.ts')).toBe(hashEverything(repo.root).get('same-size.ts'))
  })
})
