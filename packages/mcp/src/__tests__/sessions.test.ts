import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { initWorkspace, openWorkspace, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import type { ContinuumEvent } from '@continuum/core'
import { afterEach, describe, expect, it } from 'vitest'
import { callingSessionId, createContinuumServer } from '../server'

const sandboxes: Sandbox[] = []
const clients: Client[] = []
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close()
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

let tick = 0
const now = () => new Date(Date.UTC(2026, 9, 16, 12, 0, tick++))

async function repository(sessionIds: readonly string[] = []) {
  const repo = createSandbox({ 'src/auth.ts': 'auth' })
  sandboxes.push(repo)
  const { store } = await initWorkspace(repo.root)
  await scanRepository(store, repo.root)
  store.transact(() =>
    sessionIds.map((sessionId) => ({ type: 'session.started', evidence: 'observed', source: 'adapter:claude-code', occurredAt: now().toISOString(), payload: { sessionId, agent: 'claude-code' } }) as ContinuumEvent),
  )
  store.close()
  return repo
}

/** One agent's own connection: Claude Code runs a separate MCP server per session. */
async function connect(repo: Sandbox, sessionId?: string) {
  const server = createContinuumServer({ cwd: repo.root, version: 'test', now, ...(sessionId ? { sessionId } : {}) })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  clients.push(client)
  return async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args })
    expect(result.isError).not.toBe(true)
    return (result.content as { text: string }[])[0].text
  }
}

async function endSession(repo: Sandbox, sessionId: string) {
  const { store } = await openWorkspace(repo.root)
  store.transact(() => [{ type: 'session.ended', evidence: 'observed', source: 'adapter:claude-code', occurredAt: now().toISOString(), payload: { sessionId } }])
  store.close()
}

async function recorded(repo: Sandbox): Promise<ContinuumEvent[]> {
  const { store } = await openWorkspace(repo.root)
  try {
    return [...store.events()]
  } finally {
    store.close()
  }
}

const taskIdOf = (text: string) => /Task (\S+):/.exec(text)?.[1]

async function decisionsByTask(repo: Sandbox) {
  const memories = (await recorded(repo)).filter((event) => event.type === 'memory.recorded')
  return Object.fromEntries(memories.map(({ payload }) => [payload.title, payload.taskId]))
}

async function statusOf(repo: Sandbox, taskId: string | undefined) {
  const snapshots = (await recorded(repo)).flatMap((event) => (event.type === 'task.upserted' && event.payload.id === taskId ? [event.payload] : []))
  return snapshots.at(-1)?.status
}

describe('two sessions working at once', () => {
  it('keeps each decision on the task its own session is working on', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    const firstTask = taskIdOf(await first('start_task', { title: 'Add sign-in' }))
    const secondTask = taskIdOf(await second('start_task', { title: 'Fix billing' }))

    await first('record_decision', { title: 'Use OAuth' })
    await second('record_decision', { title: 'Round up cents' })

    expect(await decisionsByTask(repo)).toEqual({ 'Use OAuth': firstTask, 'Round up cents': secondTask })
  })

  it('updates the caller’s own task, so one agent cannot finish another’s work', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    const firstTask = taskIdOf(await first('start_task', { title: 'Add sign-in' }))
    const secondTask = taskIdOf(await second('start_task', { title: 'Fix billing' }))

    const updated = await first('update_task', { status: 'completed' })

    expect(taskIdOf(updated)).toBe(firstTask)
    expect(await statusOf(repo, secondTask)).toBe('in-progress')
  })

  it('ranks context for the caller’s own task', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    await first('start_task', { title: 'Add sign-in' })
    await second('start_task', { title: 'Fix billing' })

    expect(await first('get_context', {})).toContain('Task "Add sign-in"')
    expect(await second('get_context', {})).toContain('Task "Fix billing"')
  })

  it('links a session to its task once, however often it reports on it', async () => {
    const repo = await repository(['one'])
    const first = await connect(repo, 'one')
    await first('start_task', { title: 'Add sign-in' })
    await first('update_task', { next_action: 'Write the callback' })
    await first('update_task', { next_action: 'Test the callback' })

    expect((await recorded(repo)).filter((event) => event.type === 'session.task')).toHaveLength(1)
  })

  it('moves on when the session finishes its task', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    await first('start_task', { title: 'Add sign-in' })
    const secondTask = taskIdOf(await second('start_task', { title: 'Fix billing' }))
    await first('update_task', { status: 'completed' })

    await first('record_decision', { title: 'A later note' })

    expect((await decisionsByTask(repo))['A later note']).toBe(secondTask)
  })
})

describe('a caller Continuum cannot place', () => {
  it('joins the current task until the session starts its own, as a briefing asks it to', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    const task = taskIdOf(await first('start_task', { title: 'Add sign-in' }))

    await second('record_decision', { title: 'A note from the second agent' })

    expect((await decisionsByTask(repo))['A note from the second agent']).toBe(task)
  })

  // Claude Code keeps an MCP server across /clear, with the id it was started with, while hooks move to a new one.
  it('stops acting for a session that has ended', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    await first('start_task', { title: 'Add sign-in' })
    const current = taskIdOf(await second('start_task', { title: 'Fix billing' }))
    await endSession(repo, 'one')

    await first('record_decision', { title: 'After clearing' })
    const updated = await first('update_task', { next_action: 'After clearing too' })

    expect((await decisionsByTask(repo))['After clearing']).toBe(current)
    expect(taskIdOf(updated)).toBe(current)
  })

  it('writes no link for a session that has ended', async () => {
    const repo = await repository(['one'])
    const first = await connect(repo, 'one')
    await endSession(repo, 'one')

    await first('start_task', { title: 'Add sign-in' })

    expect((await recorded(repo)).filter((event) => event.type === 'session.task')).toEqual([])
  })

  it('uses the repository’s current task when the client names no session', async () => {
    const repo = await repository()
    const [first, second] = [await connect(repo), await connect(repo)]
    await first('start_task', { title: 'Add sign-in' })
    const newest = taskIdOf(await second('start_task', { title: 'Fix billing' }))

    await first('record_decision', { title: 'A note' })

    expect((await decisionsByTask(repo))['A note']).toBe(newest)
  })

  it('invents no session for an id no hook has reported', async () => {
    const repo = await repository()
    const stranger = await connect(repo, 'never-started')
    const task = taskIdOf(await stranger('start_task', { title: 'Add sign-in' }))

    await stranger('record_decision', { title: 'A note' })

    const events = await recorded(repo)
    expect(events.filter((event) => event.type === 'session.task')).toEqual([])
    expect((await decisionsByTask(repo))['A note']).toBe(task)
  })
})

describe('callingSessionId', () => {
  it('reads the id Claude Code gives its MCP servers', () => {
    expect(callingSessionId({ CLAUDE_CODE_SESSION_ID: ' abc-123 ' })).toBe('abc-123')
  })

  it('is undefined for clients that set nothing', () => {
    expect(callingSessionId({})).toBeUndefined()
    expect(callingSessionId({ CLAUDE_CODE_SESSION_ID: '  ' })).toBeUndefined()
  })
})
