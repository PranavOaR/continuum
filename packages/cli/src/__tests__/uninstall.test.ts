import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_OK, EXIT_USAGE } from '../io'
import { cli } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function sandbox(files: Record<string, string> = {}) {
  const repo = createSandbox({ 'src/app.ts': 'export {}\n', ...files })
  sandboxes.push(repo)
  return repo
}

/** Every file and directory in the working tree plus .git/info/exclude, with contents. */
function snapshot(root: string): Record<string, string> {
  const entries: Record<string, string> = {}
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (relative(root, path) === '.git') continue
      if (statSync(path).isDirectory()) {
        entries[`${relative(root, path)}/`] = ''
        walk(path)
      } else entries[relative(root, path)] = readFileSync(path, 'utf8')
    }
  }
  walk(root)
  entries['.git/info/exclude'] = readFileSync(join(root, '.git/info/exclude'), 'utf8')
  return entries
}

describe('continuum uninstall', () => {
  it('with --purge leaves the repository exactly as it was before setup', async () => {
    const repo = sandbox()
    const before = snapshot(repo.root)
    expect((await cli(repo.root, ['setup', 'claude-code'])).code).toBe(EXIT_OK)
    expect(existsSync(join(repo.root, '.continuum'))).toBe(true)

    const result = await cli(repo.root, ['uninstall', '--purge'])
    expect(result.code).toBe(EXIT_OK)
    expect(result.out).toContain('Continuum is removed from this repository.')
    expect(snapshot(repo.root)).toEqual(before)
  })

  it("keeps the user's own Claude Code settings and hooks", async () => {
    const settings = { permissions: { allow: ['Bash(npm test)'] } }
    const repo = sandbox({ '.claude/settings.local.json': JSON.stringify(settings) })
    await cli(repo.root, ['setup', 'claude-code'])
    await cli(repo.root, ['uninstall', '--purge'])
    expect(JSON.parse(readFileSync(join(repo.root, '.claude/settings.local.json'), 'utf8'))).toEqual(settings)
  })

  it('keeps the recorded history unless asked to purge it', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])
    const result = await cli(repo.root, ['uninstall'])
    expect(result.out).toContain('uninstall --purge')
    expect(existsSync(join(repo.root, '.continuum/context.db'))).toBe(true)
    expect(existsSync(join(repo.root, '.mcp.json'))).toBe(false)
  })

  it('says so when there is nothing to remove, and rejects unknown options', async () => {
    const repo = sandbox()
    expect((await cli(repo.root, ['uninstall'])).out).toContain('nothing to remove')
    expect((await cli(repo.root, ['uninstall', '--force'])).code).toBe(EXIT_USAGE)
  })
})
