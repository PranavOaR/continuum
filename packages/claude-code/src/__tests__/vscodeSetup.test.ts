import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { SetupError } from '../setup'
import { removeVsCodeSetup, setupVsCode, VSCODE_HOOKS_FILE, VSCODE_INSTRUCTIONS_FILE, VSCODE_MCP_FILE } from '../vscodeSetup'

const CHECKOUT = { command: '/usr/local/bin/node', args: ['--import', 'file:///x/tsx/loader.mjs', '/x/continuum/packages/cli/src/bin.ts'], portable: false }
const NPX = { command: 'npx', args: ['-y', 'getcontinuum@0.2.0'], portable: true }
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
const readJson = (root: string, file: string) => JSON.parse(readFileSync(join(root, file), 'utf8'))

describe('setupVsCode', () => {
  it('adds the MCP server next to yours, Copilot agent hooks and instructions for every chat', async () => {
    const { root } = repo()
    write(root, VSCODE_MCP_FILE, JSON.stringify({ servers: { github: { type: 'http', url: 'https://example.test/mcp' } }, inputs: [] }))
    const result = await setupVsCode(root, CHECKOUT)
    expect(result.files.map((file) => [file.path, file.action])).toEqual([
      [VSCODE_MCP_FILE, 'updated'],
      [VSCODE_HOOKS_FILE, 'created'],
      [VSCODE_INSTRUCTIONS_FILE, 'created'],
    ])
    const config = readJson(root, VSCODE_MCP_FILE)
    expect(Object.keys(config.servers).sort()).toEqual(['continuum', 'github'])
    expect(config.inputs).toEqual([])
    expect(config.servers.continuum).toEqual({ type: 'stdio', command: CHECKOUT.command, args: [...CHECKOUT.args, 'mcp'], cwd: '${workspaceFolder}' })

    const { hooks } = readJson(root, VSCODE_HOOKS_FILE)
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'])
    expect(hooks.SessionStart[0].command).toBe(`${CHECKOUT.command} --import file:///x/tsx/loader.mjs ${CHECKOUT.args[2]} ingest --agent vscode`)

    const instructions = readFileSync(join(root, VSCODE_INSTRUCTIONS_FILE), 'utf8')
    expect(instructions).toMatch(/^---\napplyTo: '\*\*'\ndescription: .+\n---\n/)
    expect(instructions).toContain('get_handoff')
    expect((await setupVsCode(root, CHECKOUT)).files.map((file) => file.action)).toEqual(['unchanged', 'unchanged', 'unchanged'])
  })

  it('keeps machine-specific files out of git, and lets portable ones be committed', async () => {
    const local = repo()
    await setupVsCode(local.root, CHECKOUT)
    const status = local.git('status', '--porcelain', '--untracked-files=all')
    expect(status).not.toContain(VSCODE_HOOKS_FILE)
    expect(status).not.toContain(VSCODE_MCP_FILE)
    expect(status).toContain(VSCODE_INSTRUCTIONS_FILE)

    const shared = repo()
    await setupVsCode(shared.root, NPX)
    expect(shared.git('status', '--porcelain', '--untracked-files=all')).toContain(VSCODE_HOOKS_FILE)
  })

  it('never overwrites hooks, instructions or a continuum server it did not write, and changes nothing when it refuses', async () => {
    const hooks = repo()
    write(hooks.root, VSCODE_HOOKS_FILE, JSON.stringify({ hooks: { PostToolUse: [{ type: 'command', command: './format.sh' }] } }))
    await expect(setupVsCode(hooks.root, CHECKOUT)).rejects.toBeInstanceOf(SetupError)
    expect(existsSync(join(hooks.root, VSCODE_MCP_FILE))).toBe(false)

    const instructions = repo()
    write(instructions.root, VSCODE_INSTRUCTIONS_FILE, 'my own instructions')
    await expect(setupVsCode(instructions.root, CHECKOUT)).rejects.toThrow(/not written by Continuum/)

    const server = repo()
    write(server.root, VSCODE_MCP_FILE, JSON.stringify({ servers: { continuum: { command: 'python', args: ['mine.py'] } } }))
    await expect(setupVsCode(server.root, CHECKOUT)).rejects.toThrow(/did not write/)
    expect(existsSync(join(server.root, VSCODE_HOOKS_FILE))).toBe(false)
  })

  it('leaves a .vscode/mcp.json the team tracks alone, and says how to add the server for yourself', async () => {
    const { root, git } = repo()
    write(root, VSCODE_MCP_FILE, JSON.stringify({ servers: {} }))
    git('add', VSCODE_MCP_FILE)
    git('commit', '-qm', 'shared mcp')
    const [mcp] = (await setupVsCode(root, CHECKOUT)).files
    expect(mcp.action).toBe('skipped')
    expect(mcp.note).toContain('code --add-mcp')
    expect(readJson(root, VSCODE_MCP_FILE)).toEqual({ servers: {} })
  })

  it('removes exactly what it added, and can set up again afterwards', async () => {
    const { root, git } = repo()
    write(root, VSCODE_MCP_FILE, JSON.stringify({ servers: { github: { type: 'http', url: 'https://example.test/mcp' } } }))
    await setupVsCode(root, NPX)
    git('add', VSCODE_HOOKS_FILE)
    git('commit', '-qm', 'share hooks')

    expect((await removeVsCodeSetup(root)).files.map((file) => file.path)).toEqual([VSCODE_MCP_FILE, VSCODE_HOOKS_FILE, VSCODE_INSTRUCTIONS_FILE])
    expect(Object.keys(readJson(root, VSCODE_MCP_FILE).servers)).toEqual(['github'])
    // Tracked, so emptied rather than deleted.
    expect(readJson(root, VSCODE_HOOKS_FILE)).toEqual({ hooks: {} })
    expect(existsSync(join(root, VSCODE_INSTRUCTIONS_FILE))).toBe(false)
    expect((await removeVsCodeSetup(root)).files).toEqual([])
    expect((await setupVsCode(root, NPX)).files.map((file) => file.action)).toEqual(['updated', 'updated', 'created'])
  })
})

describe('the hooks setup writes', () => {
  /** An invocation that saves its stdin, standing in for Continuum, so the shell commands can run for real. */
  function recorder(root: string, delaySeconds = 0) {
    const script = join(root, 'record.sh')
    writeFileSync(script, `sleep ${delaySeconds}; cat > "${join(root, 'received.json')}"\n`)
    return { command: 'sh', args: [script], portable: false }
  }

  async function postToolUse(root: string, delaySeconds = 0) {
    await setupVsCode(root, recorder(root, delaySeconds))
    return readJson(root, VSCODE_HOOKS_FILE).hooks.PostToolUse[0].command as string
  }

  /** Runs a hook command as VS Code does, in a shell with the payload on stdin; returns what Continuum received. */
  async function run(root: string, command: string, payload: Record<string, unknown>): Promise<string | null> {
    execFileSync('sh', ['-c', command], { input: JSON.stringify(payload) })
    // The command returns before the recording does: wait for it in the background.
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const path = join(root, 'received.json')
      if (existsSync(path) && readFileSync(path, 'utf8') !== '') return readFileSync(path, 'utf8')
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return null
  }

  it('starts Continuum only for the tools it records, in the background, with the payload intact', async () => {
    const { root } = repo()
    const command = await postToolUse(root)
    const edit = { hook_event_name: 'PostToolUse', session_id: 's', tool_name: 'create_file', tool_input: { filePath: join(root, 'b.ts'), content: "it's \"quoted\"" } }
    expect(JSON.parse((await run(root, command, edit)) ?? 'null')).toEqual(edit)
  })

  it('returns at once, however long recording takes, so Copilot is never held up', async () => {
    const { root } = repo()
    const command = await postToolUse(root, 1)
    const started = Date.now()
    execFileSync('sh', ['-c', command], { input: JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 's', tool_name: 'create_file', tool_input: {} }) })
    expect(Date.now() - started).toBeLessThan(500)
    // Only waits for the background recording; the command reads its input, or writing it can fail with EPIPE.
    expect(await run(root, 'cat >/dev/null', {})).not.toBeNull()
  })

  it('does not start Continuum for reads, searches or terminal commands', async () => {
    const { root } = repo()
    const command = await postToolUse(root)
    for (const tool_name of ['read_file', 'grep_search', 'run_in_terminal']) {
      execFileSync('sh', ['-c', command], { input: JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 's', tool_name, tool_input: {} }) })
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(existsSync(join(root, 'received.json'))).toBe(false)
  })
})
