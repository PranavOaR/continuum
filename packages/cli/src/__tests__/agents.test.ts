import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { EXIT_USAGE } from '../io'
import { cli } from './harness'

const sandboxes: Sandbox[] = []
afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function sandbox() {
  const repo = createSandbox({ 'src/login.ts': 'export const login = () => {}\n', 'package.json': '{}' })
  sandboxes.push(repo)
  return repo
}

interface Handler {
  command: string
  args: string[]
}

/** The exact command Claude Code would run for a hook event, read from the generated settings. */
function configuredHook(root: string, event: string): Handler {
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.local.json'), 'utf8'))
  return settings.hooks[event][0].hooks[0]
}

function fireHook(root: string, event: string, fields: Record<string, unknown>, sessionId: string): string {
  const { command, args } = configuredHook(root, event)
  const payload = JSON.stringify({ session_id: sessionId, cwd: root, transcript_path: '/t.jsonl', hook_event_name: event, ...fields })
  return execFileSync(command, args, { cwd: root, input: payload, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
}

describe('continuum setup claude-code', () => {
  it('initializes, wires hooks and MCP, and removes them again', async () => {
    const repo = sandbox()
    const setup = await cli(repo.root, ['setup', 'claude-code'])
    expect(setup.code).toBe(0)
    expect(setup.out).toContain('(and initialized Continuum)')
    expect(setup.out).toContain('created   .claude/settings.local.json')
    expect(setup.out).toContain('created   .mcp.json')
    expect(repo.git('status', '--porcelain')).not.toMatch(/\.mcp\.json|\.claude|\.continuum/)
    expect((await cli(repo.root, ['status'])).out).toContain('2 tracked files · all recorded')

    const removed = await cli(repo.root, ['setup', 'claude-code', '--remove'])
    expect(removed.out).toContain('removed   .claude/settings.local.json')
    expect(JSON.parse(readFileSync(join(repo.root, '.mcp.json'), 'utf8'))).toEqual({ mcpServers: {} })
  })

  it('validates its arguments', async () => {
    const repo = sandbox()
    expect(await cli(repo.root, ['setup'])).toMatchObject({ code: EXIT_USAGE, err: expect.stringContaining('missing setup target') })
    expect((await cli(repo.root, ['setup', 'cursor'])).err).toContain('unsupported setup target')
    expect((await cli(repo.root, ['setup', 'claude-code', '--force'])).code).toBe(EXIT_USAGE)
  })
})

describe('continuum ingest', () => {
  it('ignores repositories without Continuum and reports malformed payloads without blocking', async () => {
    const repo = sandbox()
    const payload = JSON.stringify({ session_id: 's', cwd: repo.root, hook_event_name: 'Stop' })
    expect(await cli(repo.root, ['ingest'], { readStdin: async () => payload })).toMatchObject({ code: 0, out: '' })
    const bad = await cli(repo.root, ['ingest'], { readStdin: async () => '{nope' })
    expect(bad.code).toBe(1)
    expect(bad.err).toContain('Invalid Claude Code hook payload: not JSON')
  })
})

describe('continuum handoff', () => {
  it('prints the briefing and validates --max-chars', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const result = await cli(repo.root, ['handoff', '--max-chars', '800'])
    expect(result.out).toContain('# Continuum handoff:')
    expect(result.out.length).toBeLessThanOrEqual(800)
    expect((await cli(repo.root, ['handoff', '--max-chars', '10'])).code).toBe(EXIT_USAGE)
    expect((await cli(repo.root, ['handoff', 'extra'])).err).toContain('Unexpected arguments: extra')
  })
})

describe('Claude Code session, end to end through the configured commands', () => {
  it('captures one session and briefs the next one', async () => {
    const repo = sandbox()
    await cli(repo.root, ['setup', 'claude-code'])

    // Session 1: Claude edits a file, reports progress, and the session ends.
    expect(fireHook(repo.root, 'SessionStart', { source: 'startup' }, 'one')).toBe('')
    repo.write('src/login.ts', 'export const login = (user: string) => user\n')
    fireHook(repo.root, 'PostToolUse', { tool_name: 'Edit', tool_input: { file_path: join(repo.root, 'src/login.ts') } }, 'one')
    fireHook(repo.root, 'Stop', { last_assistant_message: 'Login now takes a user. Next: add the session cookie.' }, 'one')
    fireHook(repo.root, 'SessionEnd', { reason: 'prompt_input_exit' }, 'one')

    // Session 2 starts fresh and is told where session 1 left off.
    const output = JSON.parse(fireHook(repo.root, 'SessionStart', { source: 'startup' }, 'two'))
    expect(output.hookSpecificOutput.hookEventName).toBe('SessionStart')
    const context: string = output.hookSpecificOutput.additionalContext
    expect(context).toContain('"Login now takes a user. Next: add the session cookie."')
    expect(context).toContain('Files it changed: src/login.ts')

    // The agent can pull the same state over MCP, using the configured server command.
    const server = JSON.parse(readFileSync(join(repo.root, '.mcp.json'), 'utf8')).mcpServers.continuum
    const transport = new StdioClientTransport({ command: server.command, args: server.args, cwd: repo.root, stderr: 'pipe' })
    const client = new Client({ name: 'e2e', version: '0' })
    await client.connect(transport)
    try {
      const recorded = await client.callTool({ name: 'record_decision', arguments: { title: 'Cookie is httpOnly', files: ['src/login.ts'] } })
      expect(recorded.isError).toBeFalsy()
      const handoff = await client.callTool({ name: 'get_handoff', arguments: {} })
      const text = (handoff.content as { text: string }[])[0].text
      expect(text).toContain('Decision: Cookie is httpOnly.')
      expect(text).toContain('Login now takes a user.')
    } finally {
      await client.close()
    }
  }, 60_000)
})
