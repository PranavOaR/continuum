import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox } from '@continuum/capture/testing'
import { describe, expect, it } from 'vitest'
import { guardedPluginHooks } from '../plugin'
import { setupClaudeCode } from '../setup'

const ROOT = join(__dirname, '../../../..')
const read = (path: string) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'))

describe('the Claude Code plugin', () => {
  it('registers exactly the hooks and MCP server that setup writes, pinned to the CLI version', async () => {
    const version = read('packages/cli/package.json').version
    const sandbox = createSandbox({ 'a.txt': 'a' })
    try {
      await setupClaudeCode(sandbox.root, { command: 'npx', args: ['-y', `@pranavoar/continuum@${version}`], portable: true })
      const settings = JSON.parse(readFileSync(join(sandbox.root, '.claude/settings.local.json'), 'utf8'))
      expect(read('plugin/hooks/hooks.json')).toEqual({ hooks: guardedPluginHooks(settings.hooks) })
      expect(read('plugin/.mcp.json')).toEqual(JSON.parse(readFileSync(join(sandbox.root, '.mcp.json'), 'utf8')))
      expect(read('plugin/.claude-plugin/plugin.json').version).toBe(version)
    } finally {
      sandbox.cleanup()
    }
  })
})

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
        const started = performance.now()
        // Claude Code writes every hook its payload, which can be large (it carries tool output). A payload
        // bigger than a pipe's buffer fails with EPIPE unless the hook reads it before exiting.
        const output = execFileSync(handler.command, handler.args, { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir, PATH: '/usr/bin:/bin' }, input: LARGE_PAYLOAD, encoding: 'utf8' })
        expect(output).toBe('')
        // npx is not on that PATH: getting here at all proves it was never started.
        expect(performance.now() - started).toBeLessThan(2_000)
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
      const output = execFileSync(handler.command, handler.args, { cwd: repo.root, env: { ...process.env, CLAUDE_PROJECT_DIR: repo.root, PATH: `${bin}:/usr/bin:/bin` }, input: '{"hook_event_name":"SessionStart"}', encoding: 'utf8' })
      expect(output).toBe(`args: -y @pranavoar/continuum@${read('packages/cli/package.json').version} ingest\n{"hook_event_name":"SessionStart"}`)
    } finally {
      repo.cleanup()
      rmSync(bin, { recursive: true, force: true })
    }
  })
})
