import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { createSandbox } from '@continuum/capture/testing'
import { afterAll, describe, expect, it } from 'vitest'
import { guardedPluginHooks, PLUGIN_BUNDLE, pluginMcpServers } from '../plugin'
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

/**
 * A minimal PATH for running a hook: the git in use (and nothing else from its directory, which may
 * hold npx), then the system's. On macOS /usr/bin/git is a stub that fails until the Xcode license
 * is accepted, so it cannot stand in for git.
 */
const gitOnly = mkdtempSync(join(tmpdir(), 'continuum-git-only-'))
symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), join(gitOnly, 'git'))
afterAll(() => rmSync(gitOnly, { recursive: true, force: true }))
const minimalPath = (...first: string[]) => [...first, gitOnly, '/usr/bin', '/bin'].join(':')

const LARGE_PAYLOAD = JSON.stringify({ hook_event_name: 'PostToolUse', tool_response: 'x'.repeat(1_000_000) })

describe('plugin hooks outside Continuum repositories', () => {
  it('exit at once, without starting npx, where Continuum is not set up', async () => {
    const { execFileSync } = await import('node:child_process')
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { hooks } = read('plugin/hooks/hooks.json')
    const [handler] = hooks.SessionStart[0].hooks
    const plain = createSandbox({ 'a.txt': 'a' })
    const notGit = mkdtempSync(join(tmpdir(), 'continuum-not-git-'))
    try {
      for (const dir of [plain.root, notGit]) {
        // Claude Code writes every hook its payload, which can be large (it carries tool output). A payload
        // bigger than a pipe's buffer fails with EPIPE unless the hook reads it before exiting.
        const output = execFileSync(handler.command, handler.args, { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir, PATH: minimalPath() }, input: LARGE_PAYLOAD, encoding: 'utf8' })
        expect(output).toBe('')
        // npx is not on that PATH, so had the guard tried to start it, the hook would have failed: success proves it skipped.
        // (No timing assertion: a wall-clock limit failed on a slow CI runner without saying anything about the guard.)
      }
    } finally {
      plain.cleanup()
      rmSync(notGit, { recursive: true, force: true })
    }
  })

  it('hand the payload to the CLI where Continuum is set up', async () => {
    const { execFileSync } = await import('node:child_process')
    const { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { hooks } = read('plugin/hooks/hooks.json')
    const [handler] = hooks.SessionStart[0].hooks
    const repo = createSandbox({ 'a.txt': 'a' })
    mkdirSync(join(repo.root, '.continuum'))
    // A stand-in npx that echoes its arguments and the payload it received.
    const bin = mkdtempSync(join(tmpdir(), 'continuum-fake-npx-'))
    writeFileSync(join(bin, 'npx'), '#!/bin/sh\necho "args: $*"\ncat\n')
    chmodSync(join(bin, 'npx'), 0o755)
    try {
      const output = execFileSync(handler.command, handler.args, { cwd: repo.root, env: { ...process.env, CLAUDE_PROJECT_DIR: repo.root, PATH: minimalPath(bin) }, input: '{"hook_event_name":"SessionStart"}', encoding: 'utf8' })
      expect(output).toBe(`args: -y getcontinuum@${read('packages/cli/package.json').version} ingest\n{"hook_event_name":"SessionStart"}`)
    } finally {
      repo.cleanup()
      rmSync(bin, { recursive: true, force: true })
    }
  })
})

describe("the plugin's own copy of the CLI", () => {
  /** A stand-in bundle that echoes its arguments and the payload, in a plugin directory. */
  async function pluginWithBundle() {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const root = mkdtempSync(join(tmpdir(), 'continuum-plugin-root-'))
    mkdirSync(join(root, 'bin'))
    writeFileSync(join(root, PLUGIN_BUNDLE), "process.stdout.write('bundle: ' + process.argv.slice(2).join(' ') + '\\n'); process.stdin.pipe(process.stdout)\n")
    return root
  }

  it('runs hooks with node, never npx, when the plugin carries it', async () => {
    const { execFileSync } = await import('node:child_process')
    const { mkdirSync, rmSync } = await import('node:fs')
    const [handler] = read('plugin/hooks/hooks.json').hooks.SessionStart[0].hooks
    const repo = createSandbox({ 'a.txt': 'a' })
    mkdirSync(join(repo.root, '.continuum'))
    const pluginRoot = await pluginWithBundle()
    try {
      // The stand-in prints "bundle:"; npx, had the hook fallen back to it, would not.
      const env = { ...process.env, CLAUDE_PROJECT_DIR: repo.root, CLAUDE_PLUGIN_ROOT: pluginRoot, PATH: minimalPath(dirname(process.execPath)) }
      const output = execFileSync(handler.command, handler.args, { cwd: repo.root, env, input: '{"hook_event_name":"SessionStart"}', encoding: 'utf8' })
      expect(output).toBe('bundle: ingest\n{"hook_event_name":"SessionStart"}')
    } finally {
      repo.cleanup()
      rmSync(pluginRoot, { recursive: true, force: true })
    }
  })

  it('starts the MCP server with node too', async () => {
    const { execFileSync } = await import('node:child_process')
    const { rmSync } = await import('node:fs')
    const server = read('plugin/.mcp.json').mcpServers.continuum
    const pluginRoot = await pluginWithBundle()
    try {
      const env = { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, PATH: minimalPath(dirname(process.execPath)) }
      expect(execFileSync(server.command, server.args, { env, input: '', encoding: 'utf8' })).toBe('bundle: mcp\n')
    } finally {
      rmSync(pluginRoot, { recursive: true, force: true })
    }
  })
})
