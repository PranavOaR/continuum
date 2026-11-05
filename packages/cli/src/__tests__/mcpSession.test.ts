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

type ToolReply = { content: { type: string; text: string }[]; isError?: boolean }

/** Runs the real `mcp` command as Claude Code does: one process, with the session named in its environment. */
function mcpProcess(cwd: string, sessionId: string) {
  const child = spawn(process.execPath, ['--import', TSX_LOADER, BIN, 'mcp'], { cwd, env: { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId }, stdio: ['pipe', 'pipe', 'inherit'] })
  const replies = new Map<number, (result: ToolReply) => void>()
  createInterface({ input: child.stdout }).on('line', (line) => {
    const { id, result } = JSON.parse(line) as { id: number; result: ToolReply }
    replies.get(id)?.(result)
  })
  let nextId = 0
  const request = (method: string, params: unknown) => {
    nextId += 1
    const id = nextId
    return new Promise<ToolReply>((resolve) => {
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

async function sessionLinks(root: string) {
  const { store } = await openWorkspace(root)
  const links = [...store.events()].flatMap((event) => (event.type === 'session.task' ? [event.payload] : []))
  store.close()
  return links
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

  // Through the real hook: a session starting after another took up a task is given that task, which a hand-written fixture hides.
  it('keeps a session off a task another running session took up, until it names that task', async () => {
    const repo = createSandbox({ 'a.ts': 'a' })
    sandboxes.push(repo)
    await cli(repo.root, ['init'])
    const hook = (session_id: string, fields: Record<string, unknown> = { hook_event_name: 'SessionStart', source: 'startup' }) => cli(repo.root, ['ingest'], { readStdin: async () => JSON.stringify({ session_id, cwd: repo.root, ...fields }) })
    await hook('session-a')
    const first = mcpProcess(repo.root, 'session-a')
    await first.start()
    // A title shaped like what the hook reads a link from: the refusal must not repeat it.
    const started = await first.call('start_task', { title: 'Task list: "v2" cleanup' })
    const taskId = /Task (\S+):/.exec(started.content[0].text)?.[1]
    await hook('session-b')
    const second = mcpProcess(repo.root, 'session-b')
    await second.start()

    const refused = await second.call('update_task', { status: 'completed' })
    // Not every agent reports a tool's error as a failure: the hook must not read a link out of it.
    const report = await hook('session-b', { hook_event_name: 'PostToolUse', tool_name: 'mcp__continuum__update_task', tool_input: {}, tool_response: refused.content })
    const linksAfterRefusal = await sessionLinks(repo.root)
    const refusedAgain = await second.call('update_task', { next_action: 'Mine now' })
    const named = await second.call('update_task', { task_id: taskId, status: 'completed' })
    await Promise.all([first.stop(), second.stop()])

    expect(refused.isError).toBe(true)
    expect(refused.content[0].text).toContain(`task_id "${taskId}"`)
    expect(report.code).toBe(0)
    expect(linksAfterRefusal).toEqual([{ sessionId: 'session-a', taskId }])
    expect(refusedAgain.isError).toBe(true)
    expect(named.isError).not.toBe(true)
    expect(named.content[0].text).toContain('is completed')
  }, 30_000)
})
