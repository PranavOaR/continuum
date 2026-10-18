import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { CURSOR_MCP_FILE, CURSOR_RULE_FILE, removeCursorSetup, setupCursor } from '../cursorSetup'
import { SetupError } from '../setup'

const CHECKOUT = { command: '/usr/local/bin/node', args: ['--import', 'file:///x/tsx/loader.mjs', '/x/continuum/packages/cli/src/bin.ts'], portable: false }
const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function repo() {
  const created = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(created)
  return created
}
const write = (root: string, file: string, text: string) => {
  mkdirSync(join(root, file, '..'), { recursive: true })
  writeFileSync(join(root, file), text)
}

describe('setupCursor', () => {
  it('adds the MCP server next to yours and an always-applied rule', async () => {
    const { root, git } = repo()
    write(root, CURSOR_MCP_FILE, JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } } }))
    const result = await setupCursor(root, CHECKOUT)
    expect(result.files.map((file) => [file.path, file.action])).toEqual([
      [CURSOR_MCP_FILE, 'updated'],
      [CURSOR_RULE_FILE, 'created'],
    ])
    const config = JSON.parse(readFileSync(join(root, CURSOR_MCP_FILE), 'utf8'))
    expect(Object.keys(config.mcpServers).sort()).toEqual(['continuum', 'github'])
    expect(config.mcpServers.continuum.args.at(-1)).toBe('mcp')
    const rule = readFileSync(join(root, CURSOR_RULE_FILE), 'utf8')
    expect(rule).toMatch(/^---\ndescription: .+\nalwaysApply: true\n---\n/)
    expect(rule).toContain('get_handoff')
    // The rule has no machine paths, so it can be committed; the server entry here can be too, since the file was already the user's.
    expect(git('status', '--porcelain')).toContain('.cursor/')
    expect((await setupCursor(root, CHECKOUT)).files.map((file) => file.action)).toEqual(['unchanged', 'unchanged'])
  })

  it('never overwrites a rule file or a continuum server it did not write', async () => {
    const mine = repo()
    write(mine.root, CURSOR_RULE_FILE, '---\nalwaysApply: true\n---\nmy own rule')
    await expect(setupCursor(mine.root, CHECKOUT)).rejects.toBeInstanceOf(SetupError)
    const other = repo()
    write(other.root, CURSOR_MCP_FILE, JSON.stringify({ mcpServers: { continuum: { command: 'python', args: ['mine.py'] } } }))
    await expect(setupCursor(other.root, CHECKOUT)).rejects.toThrow(/did not write/)
  })

  it("removal leaves a continuum server it did not write untouched, without failing", async () => {
    const { root } = repo()
    const theirs = { mcpServers: { continuum: { command: 'python', args: ['mine.py'] } } }
    write(root, CURSOR_MCP_FILE, JSON.stringify(theirs))
    expect((await removeCursorSetup(root)).files).toEqual([])
    expect(JSON.parse(readFileSync(join(root, CURSOR_MCP_FILE), 'utf8'))).toEqual(theirs)
  })

  it('removes exactly what it added', async () => {
    const { root } = repo()
    await setupCursor(root, CHECKOUT)
    await removeCursorSetup(root)
    expect(existsSync(join(root, CURSOR_MCP_FILE))).toBe(false)
    expect(existsSync(join(root, CURSOR_RULE_FILE))).toBe(false)
  })
})
