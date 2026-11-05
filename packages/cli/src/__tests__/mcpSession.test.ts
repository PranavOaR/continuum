import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { openWorkspace } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { cli } from './harness'

const BIN = fileURLToPath(new URL('../bin.ts', import.meta.url))
const TSX_LOADER = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
const sandboxes: Sandbox[] = []

afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

/** Runs the real `mcp` command as Claude Code does: one process, with the session named in its environment. */
function mcpProcess(cwd: string, sessionId: string) {
  const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN, 'mcp'], { cwd, env: { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId }, stdio: ['pipe', 'pipe', 'inherit'] })
  const replies = new Map<number, (result: unknown) => void>()
  createInterface({ input: child.stdout }).on('line', (line) => {
    const { id, result } = JSON.parse(line) as { id: number; result: unknown }
    replies.get(id)?.(result)
  })
  let nextId = 0
  const request = (method: string, params: unknown) => {
    nextId += 1
    const id = nextId
    return new Promise<unknown>((resolve) => {
      replies.set(id, resolve)
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
    })
  }
  const stopped = new Promise((resolve) => child.once('exit', resolve))
  return {
    start: () => request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }),
    call: (name: string, args: Record<string, unknown>) => request('tools/call', { name, arguments: args }),
    stop: () => {
      child.stdin.end()
      return stopped
    },
  }
}

describe('the mcp command', () => {
  it('acts for the session Claude Code names in its environment', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    const hook = (session_id: string) => async () => JSON.stringify({ hook_event_name: 'SessionStart', session_id, cwd: repo.root, source: 'startup' })
    await cli(repo.root, ['ingest'], { readStdin: hook('session-a') })
    await cli(repo.root, ['ingest'], { readStdin: hook('session-b') })
    const [first, second] = [mcpProcess(repo.root, 'session-a'), mcpProcess(repo.root, 'session-b')]
    await Promise.all([first.start(), second.start()])

    await first.call('start_task', { title: 'Add sign-in' })
    await second.call('start_task', { title: 'Fix billing' })
    await first.call('record_decision', { title: 'Use OAuth' })
    await Promise.all([first.stop(), second.stop()])

    const { store } = await openWorkspace(repo.root)
    const events = [...store.events()]
    store.close()
    const task = events.find((event) => event.type === 'task.upserted' && event.payload.title === 'Add sign-in')
    const decision = events.find((event) => event.type === 'memory.recorded')
    expect(decision?.type === 'memory.recorded' && decision.payload.taskId).toBe(task?.type === 'task.upserted' && task.payload.id)
  }, 30_000)
})
