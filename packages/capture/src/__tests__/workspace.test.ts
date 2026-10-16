import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSandbox, type Sandbox } from '../testing'
import { addGitExclude, excludeFromGit, includeInGit, removeGitExclude } from '../workspace'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function repo() {
  const created = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(created)
  return created
}

const excludeFile = (root: string) => join(root, '.git/info/exclude')

describe('git exclude entries', () => {
  it('removes exactly the entries Continuum added and keeps the rest of the file', async () => {
    const { root } = repo()
    writeFileSync(excludeFile(root), '# mine\n*.log\n')
    const before = readFileSync(excludeFile(root), 'utf8')
    await excludeFromGit(root)
    await addGitExclude(root, '/.mcp.json', 'Continuum: config')
    expect(readFileSync(excludeFile(root), 'utf8')).toContain('/.continuum/')

    expect(await includeInGit(root)).toBe(true)
    expect(await removeGitExclude(root, '/.mcp.json', 'Continuum: config')).toBe(true)
    expect(readFileSync(excludeFile(root), 'utf8')).toBe(before)
  })

  it('handles an exclude file with Windows line endings', async () => {
    const { root } = repo()
    writeFileSync(excludeFile(root), '*.log\r\n# Continuum local context store\r\n/.continuum/\r\n')
    expect(await includeInGit(root)).toBe(true)
    expect(readFileSync(excludeFile(root), 'utf8')).toBe('*.log\r\n')
  })

  it('leaves a pattern the user wrote themselves', async () => {
    const { root } = repo()
    writeFileSync(excludeFile(root), '/.continuum/\n')
    expect(await includeInGit(root)).toBe(false)
    expect(readFileSync(excludeFile(root), 'utf8')).toBe('/.continuum/\n')
  })
})
