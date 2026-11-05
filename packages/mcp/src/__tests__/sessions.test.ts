import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { initWorkspace, openWorkspace, scanRepository } from '@continuum/capture'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { currentTaskId, QUIET_SESSION_MS } from '@continuum/context'
import type { ContinuumEvent } from '@continuum/core'
import { afterEach, describe, expect, it } from 'vitest'
import { callingSessionId, createContinuumServer, sessionOfCall } from '../server'

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
async function connect(repo: Sandbox, sessionId?: string, callMeta?: () => Record<string, unknown>) {
  const server = createContinuumServer({ cwd: repo.root, version: 'test', now, ...(sessionId ? { sessionId } : {}) })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  clients.push(client)
  const reply = async (name: string, args: Record<string, unknown>, isRefused: boolean) => {
    const result = await client.callTool({ name, arguments: args, ...(callMeta ? { _meta: callMeta() } : {}) })
    expect(result.isError === true).toBe(isRefused)
    return (result.content as { text: string }[])[0].text
  }
  return Object.assign((name: string, args: Record<string, unknown>) => reply(name, args, false), { refused: (name: string, args: Record<string, unknown>) => reply(name, args, true) })
}

/** What the SessionStart hook records: a session starting now is given the current task. */
async function sessionStarts(repo: Sandbox, sessionId: string) {
  const { store } = await openWorkspace(repo.root)
  const at = now()
  const taskId = currentTaskId(store, at)
  store.transact(() => [{ type: 'session.started', evidence: 'observed', source: 'adapter:claude-code', occurredAt: at.toISOString(), payload: { sessionId, agent: 'claude-code', ...(taskId ? { taskId } : {}) } }])
  store.close()
}

/** What the SessionStart hook records for a session that comes back after ending. */
async function resumeSession(repo: Sandbox, sessionId: string) {
  const { store } = await openWorkspace(repo.root)
  store.transact(() => [{ type: 'session.started', evidence: 'observed', source: 'adapter:claude-code', occurredAt: now().toISOString(), payload: { sessionId, agent: 'claude-code', resumed: true } }])
  store.close()
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

async function secondSessionArrives() {
  const repo = await repository(['one'])
  const first = await connect(repo, 'one')
  const task = taskIdOf(await first('start_task', { title: 'Add sign-in' }))
  await sessionStarts(repo, 'two')
  return { repo, first, second: await connect(repo, 'two'), task }
}

describe('a session resumed after it ended', () => {
  it('acts on its own task again, not the newest one', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    const own = taskIdOf(await first('start_task', { title: 'Add sign-in' }))
    const newest = taskIdOf(await second('start_task', { title: 'Fix billing' }))
    await endSession(repo, 'one')
    await resumeSession(repo, 'one')

    await first('update_task', { status: 'completed' })

    expect(await statusOf(repo, own)).toBe('completed')
    expect(await statusOf(repo, newest)).toBe('in-progress')
  })

  it('keeps another session off its task again', async () => {
    const { repo, second, task } = await secondSessionArrives()
    await endSession(repo, 'one')
    await resumeSession(repo, 'one')

    await second.refused('update_task', { status: 'completed' })

    expect(await statusOf(repo, task)).toBe('in-progress')
  })
})

describe('a session given a task another running session took up', () => {
  it('is refused, and told which task and how to go on', async () => {
    const { repo, second, task } = await secondSessionArrives()

    const reply = await second.refused('update_task', { status: 'completed' })

    expect(reply).toContain('has not ended')
    expect(reply).toContain('start_task')
    expect(reply).toContain(`task_id "${task}"`)
    expect(await statusOf(repo, task)).toBe('in-progress')
  })

  it('stays refused while that session reports on the task, however long its turn', async () => {
    const { repo, first, second, task } = await secondSessionArrives()
    tick += QUIET_SESSION_MS / 1000 - 60
    await first('update_task', { next_action: 'Still at it' })
    tick += 120

    await second.refused('update_task', { status: 'completed' })

    expect(await statusOf(repo, task)).toBe('in-progress')
  })

  it('is refused anything else too, since one update would otherwise make the task its own', async () => {
    const { repo, second, task } = await secondSessionArrives()

    await second.refused('update_task', { next_action: 'Something of mine' })

    expect((await recorded(repo)).filter((event) => event.type === 'session.task').map((event) => event.payload)).toEqual([{ sessionId: 'one', taskId: task }])
  })

  it('may update it by naming it, and then it is that session’s task too', async () => {
    const { repo, second, task } = await secondSessionArrives()

    await second('update_task', { task_id: task, next_action: 'Take over the callback' })
    await second('update_task', { status: 'completed' })

    expect(await statusOf(repo, task)).toBe('completed')
  })

  it('can start its own task, and the other session’s stays in progress', async () => {
    const { repo, first, second, task } = await secondSessionArrives()

    const own = taskIdOf(await second('start_task', { title: 'Fix billing' }))
    await second('update_task', { status: 'completed' })
    await first('update_task', { next_action: 'Write the callback' })

    expect(await statusOf(repo, own)).toBe('completed')
    expect(await statusOf(repo, task)).toBe('in-progress')
  })

  it('does not stop the session that took the task up', async () => {
    const { repo, first, task } = await secondSessionArrives()

    await first('update_task', { status: 'completed' })

    expect(await statusOf(repo, task)).toBe('completed')
  })

  it('carries on once that session has ended, which is an ordinary handoff', async () => {
    const { repo, second, task } = await secondSessionArrives()
    await endSession(repo, 'one')

    await second('update_task', { status: 'completed' })

    expect(await statusOf(repo, task)).toBe('completed')
  })

  it('carries on once that session has gone quiet, since a crash reports no end', async () => {
    const { repo, second, task } = await secondSessionArrives()
    tick += QUIET_SESSION_MS / 1000 + 1

    await second('update_task', { status: 'completed' })

    expect(await statusOf(repo, task)).toBe('completed')
  })

  it('gives a task nobody took up to the first session that reports on it', async () => {
    const repo = await repository()
    const { store } = await openWorkspace(repo.root)
    store.transact(() => [{ type: 'task.upserted', evidence: 'user-reported', source: 'cli', occurredAt: now().toISOString(), payload: { id: 'yours', title: 'Yours', status: 'in-progress' } }])
    store.close()
    await sessionStarts(repo, 'one')
    await sessionStarts(repo, 'two')
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]

    await first('update_task', { next_action: 'Mine' })
    await second.refused('update_task', { next_action: 'Mine too' })
    await second('update_task', { task_id: 'yours', next_action: 'Shared' })

    expect(await statusOf(repo, 'yours')).toBe('in-progress')
  })

  it('never stops a caller that names no session: the session on the task may be its own', async () => {
    const repo = await repository(['one'])
    const first = await connect(repo, 'one')
    const task = taskIdOf(await first('start_task', { title: 'Add sign-in' }))
    const unnamed = await connect(repo)

    await unnamed('update_task', { status: 'completed' })

    expect(await statusOf(repo, task)).toBe('completed')
  })
})

describe('starting a task leaves running sessions alone', () => {
  it('pauses nothing another running session took up', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    const task = taskIdOf(await first('start_task', { title: 'Add sign-in' }))

    await second('start_task', { title: 'Fix billing' })

    expect(await statusOf(repo, task)).toBe('in-progress')
  })

  it('still pauses the caller’s own earlier task', async () => {
    const repo = await repository(['one'])
    const first = await connect(repo, 'one')
    const task = taskIdOf(await first('start_task', { title: 'Add sign-in' }))

    await first('start_task', { title: 'Fix billing' })

    expect(await statusOf(repo, task)).toBe('planned')
  })

  it('still pauses a task whose session has ended', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    const task = taskIdOf(await first('start_task', { title: 'Add sign-in' }))
    await endSession(repo, 'one')

    await second('start_task', { title: 'Fix billing' })

    expect(await statusOf(repo, task)).toBe('planned')
  })

  // Past /clear the server still holds the old id, and the session on a task may be this one under its new id.
  it('still pauses everything for a session that has ended', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, 'one'), await connect(repo, 'two')]
    await first('start_task', { title: 'Add sign-in' })
    const task = taskIdOf(await second('start_task', { title: 'Fix billing' }))
    await endSession(repo, 'one')

    await first('start_task', { title: 'Write the docs' })

    expect(await statusOf(repo, task)).toBe('planned')
  })

  it('still pauses everything for a caller that names no session', async () => {
    const repo = await repository(['one'])
    const first = await connect(repo, 'one')
    const task = taskIdOf(await first('start_task', { title: 'Add sign-in' }))
    const unnamed = await connect(repo)

    await unnamed('start_task', { title: 'Fix billing' })

    expect(await statusOf(repo, task)).toBe('planned')
  })
})

describe('Codex, which names its session on each call', () => {
  const asCodex = (session_id: string) => () => ({ 'x-codex-turn-metadata': { session_id, thread_id: session_id }, threadId: session_id })

  it('acts on the task of the session each call names, even through one server', async () => {
    const repo = await repository(['one', 'two'])
    let caller = 'one'
    const shared = await connect(repo, undefined, () => asCodex(caller)())
    const firstTask = taskIdOf(await shared('start_task', { title: 'Add sign-in' }))
    caller = 'two'
    const secondTask = taskIdOf(await shared('start_task', { title: 'Fix billing' }))

    caller = 'one'
    await shared('record_decision', { title: 'Use OAuth' })
    await shared('update_task', { status: 'completed' })

    expect((await decisionsByTask(repo))['Use OAuth']).toBe(firstTask)
    expect(await statusOf(repo, firstTask)).toBe('completed')
    expect(await statusOf(repo, secondTask)).toBe('in-progress')
  })

  it('ranks context for the session the call names', async () => {
    const repo = await repository(['one', 'two'])
    const [first, second] = [await connect(repo, undefined, asCodex('one')), await connect(repo, undefined, asCodex('two'))]
    await first('start_task', { title: 'Add sign-in' })
    await second('start_task', { title: 'Fix billing' })

    expect(await first('get_context', {})).toContain('Task "Add sign-in"')
  })

  it('is kept off a task another running session took up', async () => {
    const repo = await repository(['claude'])
    const claude = await connect(repo, 'claude')
    const task = taskIdOf(await claude('start_task', { title: 'Add sign-in' }))
    await sessionStarts(repo, 'codex')
    const codex = await connect(repo, undefined, asCodex('codex'))

    await codex.refused('update_task', { status: 'completed' })

    expect(await statusOf(repo, task)).toBe('in-progress')
  })

  it('links its own session in the same write as the task', async () => {
    const repo = await repository(['codex'])
    const codex = await connect(repo, undefined, asCodex('codex'))

    const task = taskIdOf(await codex('start_task', { title: 'Add sign-in' }))

    expect((await recorded(repo)).filter((event) => event.type === 'session.task')).toMatchObject([{ source: 'mcp', payload: { sessionId: 'codex', taskId: task } }])
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

describe('sessionOfCall', () => {
  const named = (session_id: unknown) => ({ 'x-codex-turn-metadata': { session_id } })

  it('prefers the session the call names over the one the server started with', () => {
    expect(sessionOfCall(named(' abc-123 '), 'from-env')).toBe('abc-123')
  })

  it('falls back when the undocumented field is missing or has changed shape', () => {
    for (const meta of [undefined, {}, named(''), named('  '), named(7), { 'x-codex-turn-metadata': 'abc' }, { 'x-codex-turn-metadata': null }]) {
      expect(sessionOfCall(meta, 'from-env')).toBe('from-env')
      expect(sessionOfCall(meta)).toBeUndefined()
    }
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
