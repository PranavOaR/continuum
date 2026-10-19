import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { CODEX_CONFIG_FILE, CODEX_HOOKS_FILE, removeCodexSetup, setupCodex } from '../codexSetup'
import { SetupError } from '../setup'

const CHECKOUT = { command: '/usr/local/bin/node', args: ['--import', 'file:///x/tsx/loader.mjs', '/x/my continuum/packages/cli/src/bin.ts'], portable: false }
const NPX = { command: 'npx', args: ['-y', 'getcontinuum@0.1.0'], portable: true }
const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function repo() {
  const created = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(created)
  return created
}
const read = (root: string, file: string) => readFileSync(join(root, file), 'utf8')
const write = (root: string, file: string, text: string) => {
  mkdirSync(join(root, '.codex'), { recursive: true })
  writeFileSync(join(root, file), text)
}

describe('setupCodex', () => {
  it('writes project hooks and the MCP server, as one quoted shell command per hook', async () => {
    const { root, git } = repo()
    const result = await setupCodex(root, CHECKOUT)
    expect(result.files.map((file) => file.action)).toEqual(['created', 'created'])
    const { hooks } = JSON.parse(read(root, CODEX_HOOKS_FILE))
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'UserPromptSubmit'])
    expect(hooks.SessionStart[0].hooks[0].command).toBe("/usr/local/bin/node --import file:///x/tsx/loader.mjs '/x/my continuum/packages/cli/src/bin.ts' ingest --agent codex")
    expect(hooks.PostToolUse[0].matcher).toBe('^apply_patch$|^mcp__continuum__start_task$|^mcp__continuum__update_task$')
    expect(read(root, CODEX_CONFIG_FILE)).toContain('[mcp_servers.continuum]\ncommand = "/usr/local/bin/node"\nargs = ["--import", "file:///x/tsx/loader.mjs", "/x/my continuum/packages/cli/src/bin.ts", "mcp"]')
    // Machine-specific paths stay out of git.
    expect(git('status', '--porcelain')).toBe('?? a.ts')
  })

  it("keeps the user's own hooks and config, and replaces only its own on a re-run", async () => {
    const { root } = repo()
    const theirs = { type: 'command', command: 'python3 lint.py' }
    write(root, CODEX_HOOKS_FILE, JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [theirs] }] } }))
    write(root, CODEX_CONFIG_FILE, 'model = "gpt-5.6-luna"\n\n[mcp_servers.github]\ncommand = "gh-mcp"\n')
    await setupCodex(root, CHECKOUT)
    await setupCodex(root, NPX)
    const { hooks } = JSON.parse(read(root, CODEX_HOOKS_FILE))
    expect(hooks.PostToolUse).toHaveLength(2)
    expect(hooks.PostToolUse[0]).toEqual({ matcher: 'Bash', hooks: [theirs] })
    expect(hooks.SessionStart[0].hooks[0].command).toBe('npx -y getcontinuum@0.1.0 ingest --agent codex')
    const config = read(root, CODEX_CONFIG_FILE)
    expect(config.match(/\[mcp_servers\.continuum\]/g)).toHaveLength(1)
    expect(config).toContain('model = "gpt-5.6-luna"')
    expect(config).toContain('[mcp_servers.github]')
    expect((await setupCodex(root, NPX)).files.map((file) => file.action)).toEqual(['unchanged', 'unchanged'])
  })

  it('refuses to touch a continuum server it did not write', async () => {
    const { root } = repo()
    write(root, CODEX_CONFIG_FILE, '[mcp_servers.continuum]\ncommand = "my-own"\n')
    await expect(setupCodex(root, NPX)).rejects.toBeInstanceOf(SetupError)
    expect(existsSync(join(root, CODEX_HOOKS_FILE))).toBe(false)
  })

  it("leaves a user's hook alone even when its path mentions continuum", async () => {
    const { root } = repo()
    const theirs = { type: 'command', command: '/home/u/continuum-scripts/log.sh ingest --agent codex' }
    write(root, CODEX_HOOKS_FILE, JSON.stringify({ hooks: { Stop: [{ hooks: [theirs] }] } }))
    await setupCodex(root, CHECKOUT)
    await removeCodexSetup(root)
    expect(JSON.parse(read(root, CODEX_HOOKS_FILE)).hooks.Stop).toEqual([{ hooks: [theirs] }])
  })

  it('refuses a continuum server defined through a subtable, and a half-removed block', async () => {
    const sub = repo()
    write(sub.root, CODEX_CONFIG_FILE, '[mcp_servers.continuum.env]\nKEY = "x"\n')
    await expect(setupCodex(sub.root, NPX)).rejects.toThrow(/did not write/)
    const broken = repo()
    write(broken.root, CODEX_CONFIG_FILE, '# >>> continuum: managed by `continuum setup codex`; do not edit inside >>>\n[mcp_servers.continuum]\n')
    await expect(setupCodex(broken.root, NPX)).rejects.toThrow(/not its end/)
  })

  it('removes exactly what it added', async () => {
    const { root } = repo()
    write(root, CODEX_CONFIG_FILE, 'model = "gpt-5.6-luna"\n')
    await setupCodex(root, CHECKOUT)
    await removeCodexSetup(root)
    expect(existsSync(join(root, CODEX_HOOKS_FILE))).toBe(false)
    expect(read(root, CODEX_CONFIG_FILE)).toBe('model = "gpt-5.6-luna"\n')
  })
})
