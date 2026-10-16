import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { HOOKS_FILE, MCP_FILE, removeClaudeCodeSetup, SetupError, setupClaudeCode } from '../setup'

const INVOCATION = { command: '/usr/local/bin/node', args: ['--import', 'file:///x/tsx/loader.mjs', '/x/continuum/packages/cli/src/bin.ts'] }
const sandboxes: Sandbox[] = []

afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function repo() {
  const created = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(created)
  return created
}

const readJson = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'))
const writeJson = (root: string, file: string, value: unknown) => {
  mkdirSync(join(root, file, '..'), { recursive: true })
  writeFileSync(join(root, file), JSON.stringify(value))
}

describe('setupClaudeCode', () => {
  it('writes capture hooks and the MCP server at project scope', async () => {
    const { root, git } = repo()
    const result = await setupClaudeCode(root, INVOCATION)
    expect(result.files).toEqual([
      { path: HOOKS_FILE, action: 'created' },
      { path: MCP_FILE, action: 'created' },
    ])
    const { hooks } = readJson(root, HOOKS_FILE)
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'SessionEnd', 'SessionStart', 'Stop'])
    expect(hooks.SessionStart[0].hooks[0]).toEqual({ type: 'command', command: INVOCATION.command, args: [...INVOCATION.args, 'ingest'], timeout: 20 })
    expect(hooks.PostToolUse[0]).toMatchObject({ matcher: 'Write|Edit|MultiEdit|NotebookEdit', hooks: [{ async: true }] })
    expect(hooks.Stop[0].hooks[0].async).toBeUndefined()
    expect(readJson(root, MCP_FILE)).toEqual({ mcpServers: { continuum: { command: INVOCATION.command, args: [...INVOCATION.args, 'mcp'] } } })
    expect(git('status', '--porcelain')).toBe('?? a.ts')
  })

  it('keeps existing hooks, settings and servers, and is idempotent', async () => {
    const { root } = repo()
    const theirHook = { type: 'command', command: 'npx prettier --write' }
    writeJson(root, HOOKS_FILE, { permissions: { allow: ['Bash(npm test)'] }, hooks: { PostToolUse: [{ matcher: 'Write', hooks: [theirHook] }] } })
    writeJson(root, MCP_FILE, { mcpServers: { github: { command: 'gh-mcp' } } })

    expect((await setupClaudeCode(root, INVOCATION)).files.map((file) => file.action)).toEqual(['updated', 'updated'])
    expect((await setupClaudeCode(root, INVOCATION)).files.map((file) => file.action)).toEqual(['unchanged', 'unchanged'])

    const settings = readJson(root, HOOKS_FILE)
    expect(settings.permissions).toEqual({ allow: ['Bash(npm test)'] })
    expect(settings.hooks.PostToolUse).toHaveLength(2)
    expect(settings.hooks.PostToolUse[0]).toEqual({ matcher: 'Write', hooks: [theirHook] })
    expect(Object.keys(readJson(root, MCP_FILE).mcpServers).sort()).toEqual(['continuum', 'github'])
  })

  it('replaces its own entries when the CLI moves', async () => {
    const { root } = repo()
    await setupClaudeCode(root, INVOCATION)
    const moved = { command: 'npx', args: ['-y', '@acme/continuum'] }
    await setupClaudeCode(root, moved)
    const { hooks } = readJson(root, HOOKS_FILE)
    expect(hooks.SessionStart).toEqual([{ hooks: [expect.objectContaining({ command: 'npx', args: ['-y', '@acme/continuum', 'ingest'] })] }])
    expect(readJson(root, MCP_FILE).mcpServers.continuum).toEqual({ command: 'npx', args: ['-y', '@acme/continuum', 'mcp'] })
  })

  it('refuses to overwrite invalid JSON', async () => {
    const { root } = repo()
    mkdirSync(join(root, '.claude'))
    writeFileSync(join(root, HOOKS_FILE), '{ not json')
    await expect(setupClaudeCode(root, INVOCATION)).rejects.toBeInstanceOf(SetupError)
    expect(readFileSync(join(root, HOOKS_FILE), 'utf8')).toBe('{ not json')
    writeFileSync(join(root, HOOKS_FILE), '[]')
    await expect(setupClaudeCode(root, INVOCATION)).rejects.toThrow(/must contain a JSON object/)
  })
})

describe('setupClaudeCode with existing team configuration', () => {
  it('leaves a git-tracked .mcp.json alone and explains how to add the server privately', async () => {
    const created = repo()
    writeJson(created.root, MCP_FILE, { mcpServers: { github: { command: 'gh-mcp' } } })
    created.commit('share mcp config')
    const result = await setupClaudeCode(created.root, INVOCATION)
    expect(result.files[1]).toMatchObject({ path: MCP_FILE, action: 'skipped', note: expect.stringContaining('claude mcp add continuum -- /usr/local/bin/node') })
    expect(readJson(created.root, MCP_FILE)).toEqual({ mcpServers: { github: { command: 'gh-mcp' } } })
    expect(created.git('status', '--porcelain')).toBe('')
  })

  it('refuses to replace a "continuum" server it did not write, changing nothing', async () => {
    const { root } = repo()
    writeJson(root, MCP_FILE, { mcpServers: { continuum: { command: 'python', args: ['my_continuum_server.py'] } } })
    await expect(setupClaudeCode(root, INVOCATION)).rejects.toThrow(/did not write/)
    expect(existsSync(join(root, HOOKS_FILE))).toBe(false)
  })

  it('never mistakes a user hook for its own', async () => {
    const { root } = repo()
    const lookalike = { type: 'command', command: 'node', args: ['/home/me/continuum-tools/sync.js', 'ingest'] }
    writeJson(root, HOOKS_FILE, { hooks: { Stop: [{ hooks: [lookalike] }], Notification: 'custom-value' } })
    await setupClaudeCode(root, INVOCATION)
    await removeClaudeCodeSetup(root)
    expect(readJson(root, HOOKS_FILE)).toEqual({ hooks: { Stop: [{ hooks: [lookalike] }], Notification: 'custom-value' } })
  })

  it('recognizes its own entries from a published package', async () => {
    const { root } = repo()
    await setupClaudeCode(root, { command: 'npx', args: ['-y', '@acme/continuum@0.1.0'] })
    await setupClaudeCode(root, INVOCATION)
    expect(readJson(root, HOOKS_FILE).hooks.SessionStart).toHaveLength(1)
  })
})

describe('removeClaudeCodeSetup', () => {
  it('deletes files that held nothing but its own entries', async () => {
    const { root } = repo()
    await setupClaudeCode(root, INVOCATION)
    expect((await removeClaudeCodeSetup(root)).files.map((file) => file.action)).toEqual(['removed', 'removed'])
    expect(existsSync(join(root, HOOKS_FILE))).toBe(false)
    expect(existsSync(join(root, MCP_FILE))).toBe(false)
  })

  it('removes only what setup added', async () => {
    const { root } = repo()
    const theirHook = { type: 'command', command: 'npx prettier --write' }
    writeJson(root, HOOKS_FILE, { hooks: { PostToolUse: [{ matcher: 'Write', hooks: [theirHook] }] } })
    writeJson(root, MCP_FILE, { mcpServers: { github: { command: 'gh-mcp' } } })
    await setupClaudeCode(root, INVOCATION)

    expect((await removeClaudeCodeSetup(root)).files).toEqual([
      { path: HOOKS_FILE, action: 'removed' },
      { path: MCP_FILE, action: 'removed' },
    ])
    expect(readJson(root, HOOKS_FILE)).toEqual({ hooks: { PostToolUse: [{ matcher: 'Write', hooks: [theirHook] }] } })
    expect(readJson(root, MCP_FILE)).toEqual({ mcpServers: { github: { command: 'gh-mcp' } } })
    expect((await removeClaudeCodeSetup(root)).files.map((file) => file.action)).toEqual(['unchanged', 'unchanged'])
  })

  it('does nothing when Claude Code was never set up', async () => {
    expect(await removeClaudeCodeSetup(repo().root)).toEqual({ files: [] })
  })
})
