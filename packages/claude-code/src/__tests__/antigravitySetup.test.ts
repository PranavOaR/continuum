import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { ANTIGRAVITY_HOOKS_FILE, ANTIGRAVITY_MCP_FILE, removeAntigravitySetup, setupAntigravity } from '../antigravitySetup'
import { connectedAgents } from '../connectedAgents'
import { SetupError } from '../setup'

const CHECKOUT = { command: '/usr/local/bin/node', args: ['--import', 'file:///x/tsx/loader.mjs', '/x/my continuum/packages/cli/src/bin.ts'], portable: false }
const NPX = { command: 'npx', args: ['-y', 'getcontinuum@0.5.0'], portable: true }
const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function repo() {
  const created = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(created)
  return created
}
const read = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'))
const write = (root: string, file: string, value: unknown) => {
  mkdirSync(join(root, '.agents'), { recursive: true })
  writeFileSync(join(root, file), typeof value === 'string' ? value : JSON.stringify(value))
}

describe('setupAntigravity', () => {
  it('writes its hooks under one hook name, each naming its event, and the MCP server for this repository', async () => {
    const { root } = repo()
    const result = await setupAntigravity(root, NPX)
    expect(result.files.map((file) => [file.path, file.action])).toEqual([
      [ANTIGRAVITY_HOOKS_FILE, 'created'],
      [ANTIGRAVITY_MCP_FILE, 'created'],
    ])
    const { continuum } = read(root, ANTIGRAVITY_HOOKS_FILE)
    expect(Object.keys(continuum).sort()).toEqual(['PostToolUse', 'SessionStart', 'Stop'])
    expect(continuum.SessionStart).toEqual([{ type: 'command', command: 'npx -y getcontinuum@0.5.0 ingest --agent antigravity --event SessionStart', timeout: 20 }])
    expect(continuum.PostToolUse.map((entry: { matcher: string }) => entry.matcher)).toEqual(['write_to_file', 'replace_file_content', 'multi_replace_file_content'])
    expect(continuum.PostToolUse[0].hooks[0].command).toBe('npx -y getcontinuum@0.5.0 ingest --agent antigravity --event PostToolUse')
    expect(continuum.Stop[0].command).toBe('npx -y getcontinuum@0.5.0 ingest --agent antigravity --event Stop')
    expect(read(root, ANTIGRAVITY_MCP_FILE)).toEqual({ mcpServers: { continuum: { command: 'npx', args: ['-y', 'getcontinuum@0.5.0', 'mcp'], cwd: root } } })
  })

  it('quotes a command the shell would split, and keeps machine-specific files out of git', async () => {
    const { root, git } = repo()
    await setupAntigravity(root, CHECKOUT)
    expect(read(root, ANTIGRAVITY_HOOKS_FILE).continuum.Stop[0].command).toBe("/usr/local/bin/node --import file:///x/tsx/loader.mjs '/x/my continuum/packages/cli/src/bin.ts' ingest --agent antigravity --event Stop")
    expect(git('status', '--porcelain')).toBe('?? a.ts')
  })

  it("keeps the user's own hooks and servers, and replaces only its own on a re-run", async () => {
    const { root } = repo()
    write(root, ANTIGRAVITY_HOOKS_FILE, { lint: { PostToolUse: [{ matcher: 'run_command', hooks: [{ command: './lint.sh' }] }] } })
    write(root, ANTIGRAVITY_MCP_FILE, { mcpServers: { github: { serverUrl: 'https://example.invalid/mcp' } } })
    await setupAntigravity(root, CHECKOUT)
    expect((await setupAntigravity(root, NPX)).files.map((file) => file.action)).toEqual(['updated', 'updated'])
    expect((await setupAntigravity(root, NPX)).files.map((file) => file.action)).toEqual(['unchanged', 'unchanged'])
    const hooks = read(root, ANTIGRAVITY_HOOKS_FILE)
    expect(hooks.lint).toEqual({ PostToolUse: [{ matcher: 'run_command', hooks: [{ command: './lint.sh' }] }] })
    expect(hooks.continuum.SessionStart[0].command).toContain('getcontinuum@0.5.0')
    expect(Object.keys(read(root, ANTIGRAVITY_MCP_FILE).mcpServers).sort()).toEqual(['continuum', 'github'])
  })

  it('refuses, changing nothing, when a hook or server named continuum is not its own, or a file is not JSON', async () => {
    const { root } = repo()
    write(root, ANTIGRAVITY_HOOKS_FILE, { continuum: { Stop: [{ command: './mine.sh' }] } })
    await expect(setupAntigravity(root, NPX)).rejects.toThrow(SetupError)
    expect(existsSync(join(root, ANTIGRAVITY_MCP_FILE))).toBe(false)
    write(root, ANTIGRAVITY_HOOKS_FILE, {})
    write(root, ANTIGRAVITY_MCP_FILE, { mcpServers: { continuum: { command: 'something-else' } } })
    await expect(setupAntigravity(root, NPX)).rejects.toThrow(/"continuum" server that Continuum did not write/)
    write(root, ANTIGRAVITY_MCP_FILE, '{ nope')
    await expect(setupAntigravity(root, NPX)).rejects.toThrow(/not valid JSON/)
    expect(read(root, ANTIGRAVITY_HOOKS_FILE)).toEqual({})
  })

  it('leaves a tracked MCP file alone, and says how to add the server', async () => {
    const { root, git } = repo()
    write(root, ANTIGRAVITY_MCP_FILE, { mcpServers: {} })
    git('add', ANTIGRAVITY_MCP_FILE)
    const result = await setupAntigravity(root, NPX)
    expect(result.files[1]).toMatchObject({ path: ANTIGRAVITY_MCP_FILE, action: 'skipped', note: expect.stringContaining('tracked by git') })
    expect(read(root, ANTIGRAVITY_MCP_FILE)).toEqual({ mcpServers: {} })
  })

  it('is listed as connected once set up', async () => {
    const { root } = repo()
    expect(await connectedAgents(root, join(root, '.no-claude'))).toEqual([])
    await setupAntigravity(root, NPX)
    expect(await connectedAgents(root, join(root, '.no-claude'))).toEqual(['antigravity'])
  })
})

describe('removeAntigravitySetup', () => {
  it('removes only what setup added, and files it leaves empty', async () => {
    const { root } = repo()
    await setupAntigravity(root, NPX)
    expect((await removeAntigravitySetup(root)).files.map((file) => file.action)).toEqual(['removed', 'removed'])
    expect(existsSync(join(root, ANTIGRAVITY_HOOKS_FILE))).toBe(false)
    expect(existsSync(join(root, ANTIGRAVITY_MCP_FILE))).toBe(false)
    write(root, ANTIGRAVITY_HOOKS_FILE, { lint: { Stop: [{ command: './x' }] } })
    await setupAntigravity(root, NPX)
    await removeAntigravitySetup(root)
    expect(read(root, ANTIGRAVITY_HOOKS_FILE)).toEqual({ lint: { Stop: [{ command: './x' }] } })
    expect((await removeAntigravitySetup(root)).files.map((file) => file.action)).toEqual(['unchanged'])
  })
})
