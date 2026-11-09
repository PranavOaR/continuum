import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { createSandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { guardedPluginHooks, PLUGIN_BUNDLE, PLUGIN_LAUNCHER, pluginMcpServers } from '../plugin'
import { setupClaudeCode } from '../setup'

const ROOT = join(__dirname, '../../../..')
const read = (path: string) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'))

describe('the Claude Code plugin', () => {
  it('registers exactly the hooks and MCP server that setup writes, pinned to the CLI version', async () => {
    const version = read('packages/cli/package.json').version
    const sandbox = createSandbox({ 'a.txt': 'a' })
    try {
      await setupClaudeCode(sandbox.root, { command: 'npx', args: ['-y', `getcontinuum@${version}`], portable: true })
      const settings = JSON.parse(readFileSync(join(sandbox.root, '.claude/settings.local.json'), 'utf8'))
      expect(read('plugin/hooks/hooks.json')).toEqual({ hooks: guardedPluginHooks(settings.hooks) })
      expect(read('plugin/.mcp.json')).toEqual(pluginMcpServers(JSON.parse(readFileSync(join(sandbox.root, '.mcp.json'), 'utf8'))))
      expect(read('plugin/.claude-plugin/plugin.json').version).toBe(version)
    } finally {
      sandbox.cleanup()
    }
  })
})

/** A plugin directory holding the launcher, and optionally a stand-in bundle that echoes its arguments and the payload. */
function pluginDir({ bundle }: { bundle: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), 'continuum-plugin-root-'))
  temporary.push(root)
  copyFileSync(join(ROOT, 'plugin', PLUGIN_LAUNCHER), join(root, PLUGIN_LAUNCHER))
  if (bundle) {
    mkdirSync(join(root, 'bin'))
    writeFileSync(join(root, PLUGIN_BUNDLE), "process.stdout.write('bundle: ' + process.argv.slice(2).join(' ') + '\\n'); process.stdin.pipe(process.stdout)\n")
  }
  return root
}

/** A folder holding only a stand-in npx that echoes its arguments and the payload; the .cmd shim is what Windows finds. */
function fakeNpx(): string {
  const bin = mkdtempSync(join(tmpdir(), 'continuum-fake-npx-'))
  temporary.push(bin)
  writeFileSync(join(bin, 'fake-npx.js'), "process.stdout.write('args: ' + process.argv.slice(2).join(' ') + '\\n'); process.stdin.pipe(process.stdout)\n")
  writeFileSync(join(bin, 'npx'), `#!/bin/sh\nexec "${process.execPath}" "${join(bin, 'fake-npx.js')}" "$@"\n`, { mode: 0o755 })
  writeFileSync(join(bin, 'npx.cmd'), `@"${process.execPath}" "%~dp0fake-npx.js" %*\r\n`)
  return bin
}

/** An empty folder: a PATH of only this cannot start npx, so a hook that succeeds with it did not try. */
function emptyDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'continuum-empty-'))
  temporary.push(dir)
  return dir
}

const temporary: string[] = []
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Runs a plugin entry as Claude Code does: placeholders substituted, `node` started directly, no shell. */
function run(entry: { command: string; args: string[] }, { pluginRoot, project, path, input }: { pluginRoot: string; project?: string; path: string; input: string }): string {
  const args = entry.args.map((arg) => arg.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginRoot))
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, PATH: path, ...(project ? { CLAUDE_PROJECT_DIR: project } : {}) }
  expect(entry.command).toBe('node')
  return execFileSync(process.execPath, args, { cwd: project, env, input, encoding: 'utf8' })
}

const LARGE_PAYLOAD = JSON.stringify({ hook_event_name: 'PostToolUse', tool_response: 'x'.repeat(1_000_000) })
const SESSION_START = '{"hook_event_name":"SessionStart"}'
const sessionStartHook = () => read('plugin/hooks/hooks.json').hooks.SessionStart[0].hooks[0]

describe('plugin entries', () => {
  it('start node with no shell, so they run on Windows too', () => {
    const { hooks } = read('plugin/hooks/hooks.json')
    const entries = [...Object.values(hooks as Record<string, { hooks: { command: string; args: string[] }[] }[]>).flat().flatMap((group) => group.hooks), ...Object.values(read('plugin/.mcp.json').mcpServers as Record<string, { command: string; args: string[] }>)]
    for (const entry of entries) {
      expect(entry.command).toBe('node')
      expect(entry.args[0]).toBe(`\${CLAUDE_PLUGIN_ROOT}/${PLUGIN_LAUNCHER}`)
    }
  })
})

describe('plugin hooks outside Continuum repositories', () => {
  it('exit at once, without starting the CLI, where Continuum is not set up', () => {
    const plain = createSandbox({ 'a.txt': 'a' })
    const notGit = emptyDir()
    const pluginRoot = pluginDir({ bundle: true })
    try {
      for (const project of [plain.root, notGit]) {
        // Claude Code writes every hook its payload, which can be large (it carries tool output). A payload
        // bigger than a pipe's buffer fails with EPIPE unless the hook reads it before exiting.
        expect(run(sessionStartHook(), { pluginRoot, project, path: emptyDir(), input: LARGE_PAYLOAD })).toBe('')
      }
    } finally {
      plain.cleanup()
    }
  })

  it('find the store from a subfolder of the repository', () => {
    const repo = createSandbox({ 'src/a.txt': 'a' })
    mkdirSync(join(repo.root, '.continuum'))
    try {
      const output = run(sessionStartHook(), { pluginRoot: pluginDir({ bundle: true }), project: join(repo.root, 'src'), path: emptyDir(), input: SESSION_START })
      expect(output).toBe(`bundle: ingest\n${SESSION_START}`)
    } finally {
      repo.cleanup()
    }
  })
})

describe('without its own copy of the CLI', () => {
  it('hooks hand the payload to npx where Continuum is set up', () => {
    const repo = createSandbox({ 'a.txt': 'a' })
    mkdirSync(join(repo.root, '.continuum'))
    try {
      const output = run(sessionStartHook(), { pluginRoot: pluginDir({ bundle: false }), project: repo.root, path: fakeNpx(), input: SESSION_START })
      expect(output.replaceAll('\r\n', '\n')).toBe(`args: -y getcontinuum@${read('packages/cli/package.json').version} ingest\n${SESSION_START}`)
    } finally {
      repo.cleanup()
    }
  })
})

describe("the plugin's own copy of the CLI", () => {
  it('runs hooks in the launcher, never through npx, when the plugin carries it', () => {
    const repo = createSandbox({ 'a.txt': 'a' })
    mkdirSync(join(repo.root, '.continuum'))
    try {
      // The stand-in prints "bundle:"; npx is not on the PATH, so a fallback would have failed.
      const output = run(sessionStartHook(), { pluginRoot: pluginDir({ bundle: true }), project: repo.root, path: emptyDir(), input: SESSION_START })
      expect(output).toBe(`bundle: ingest\n${SESSION_START}`)
    } finally {
      repo.cleanup()
    }
  })

  it('starts the MCP server from it too, in any repository', () => {
    const server = read('plugin/.mcp.json').mcpServers.continuum
    expect(run(server, { pluginRoot: pluginDir({ bundle: true }), project: emptyDir(), path: emptyDir(), input: '' })).toBe('bundle: mcp\n')
  })
})
