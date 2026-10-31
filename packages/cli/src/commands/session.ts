import { randomUUID } from 'node:crypto'
import {
  clearActiveSession,
  openWorkspace,
  readActiveSession,
  readWorkingTreeWithSymbols,
  repositoryRedactor,
  scanRepository,
  claimActiveSession,
  type ActiveSession,
} from '@continuum/capture'
import { projectState, renderHandoff, sinceYouLeft } from '@continuum/context'
import { AGENTS, type AgentType } from '@continuum/core'
import { keys } from '@continuum/store'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const SESSION_USAGE = `Usage: continuum session start --agent <${AGENTS.map((agent) => agent.id).join('|')}> [--task <id>]
       continuum session note "<where things stand>"
       continuum session end [--summary "<what was done>"]
       continuum session`

/** Longest note or summary kept, matching what hooks keep for Claude Code. */
const MAX_NOTE_CHARS = 2_000
const SOURCE = 'cli'
const AGENT_IDS = new Set<string>(AGENTS.map((agent) => agent.id))

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

/** A note as stored: masked with the repository's redactor, trimmed and bounded. */
async function note(root: string, text: string): Promise<string> {
  return (await repositoryRedactor(root)).redact(text).trim().slice(0, MAX_NOTE_CHARS)
}

async function start(io: Io, args: readonly string[]): Promise<number> {
  const agent = flag(args, '--agent')
  const taskId = flag(args, '--task')
  if (!agent || !AGENT_IDS.has(agent)) {
    io.err(`continuum: --agent must be one of ${[...AGENT_IDS].join(', ')}`)
    io.err(SESSION_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    if (taskId && !store.graph.has(keys.task(taskId))) {
      io.err(`continuum: no task "${taskId}"`)
      return EXIT_FAILURE
    }
    // Changes made before the session belong to nobody; record them before it starts.
    await scanRepository(store, workspace.root, { now: io.now })
    const now = io.now().toISOString()
    const session: ActiveSession = { sessionId: `${agent}-${randomUUID().slice(0, 8)}`, agent: agent as AgentType, startedAt: now, ...(taskId ? { taskId } : {}) }
    if (!(await claimActiveSession(workspace.root, session))) {
      const open = await readActiveSession(workspace.root)
      io.err(`continuum: a ${open?.agent ?? ''} session (${open?.sessionId ?? 'unknown'}) is already open. End it first: continuum session end`)
      return EXIT_FAILURE
    }
    try {
      store.recordAll([
        { type: 'session.started', payload: { sessionId: session.sessionId, agent: session.agent, ...(taskId ? { taskId } : {}) }, evidence: 'observed', source: SOURCE, occurredAt: now },
        ...(taskId ? [{ type: 'session.task' as const, payload: { sessionId: session.sessionId, taskId }, evidence: 'observed' as const, source: SOURCE, occurredAt: now }] : []),
      ])
    } catch (error) {
      // Nothing was recorded, so the session must not stay open.
      await clearActiveSession(workspace.root)
      throw error
    }
    const state = projectState(store, await readWorkingTreeWithSymbols(store, workspace.root), io.now(), { excludeSessionId: session.sessionId })
    io.out(`Started a ${agent} session (${session.sessionId}). Changes captured by \`continuum start\` or \`scan\` are now attributed to it.`)
    io.out('Paste this briefing into the agent, and end with `continuum session end --summary "..."`:')
    io.out('')
    io.out(renderHandoff(state, { now: io.now(), since: sinceYouLeft(store, agent, session.sessionId) }))
    return EXIT_OK
  } finally {
    store.close()
  }
}

async function addNote(io: Io, text: string | undefined): Promise<number> {
  if (!text?.trim()) {
    io.err(SESSION_USAGE)
    return EXIT_USAGE
  }
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const open = await readActiveSession(workspace.root)
    if (!open) {
      io.err('continuum: no session is open. Start one with: continuum session start --agent <id>')
      return EXIT_FAILURE
    }
    store.record({ type: 'session.progress', payload: { sessionId: open.sessionId, note: await note(workspace.root, text) }, evidence: 'agent-reported', source: SOURCE, occurredAt: io.now().toISOString() })
    io.out(`Noted on ${open.sessionId}.`)
    return EXIT_OK
  } finally {
    store.close()
  }
}

async function end(io: Io, args: readonly string[]): Promise<number> {
  const summary = flag(args, '--summary')
  const { workspace, store } = await openWorkspace(io.cwd)
  try {
    const open = await readActiveSession(workspace.root)
    if (!open) {
      io.out('No session is open.')
      return EXIT_OK
    }
    const summaryNote = summary?.trim() ? await note(workspace.root, summary) : undefined
    // Whatever changed until now was this session's work.
    const { changes } = await scanRepository(store, workspace.root, { now: io.now, attributeToActiveSession: true })
    // Close the file first: a crash after this point leaves an unended session, never one that keeps collecting changes.
    await clearActiveSession(workspace.root)
    store.record({
      type: 'session.ended',
      payload: { sessionId: open.sessionId, ...(summaryNote ? { summary: summaryNote } : {}) },
      evidence: summaryNote ? 'agent-reported' : 'observed',
      source: SOURCE,
      occurredAt: io.now().toISOString(),
    })
    io.out(`Ended ${open.sessionId}${changes.length > 0 ? `; recorded ${changes.length} last change${changes.length === 1 ? '' : 's'}` : ''}.`)
    return EXIT_OK
  } finally {
    store.close()
  }
}

/** Records a session for an agent without hooks: start it, add notes, end it. */
export async function sessionCommand(io: Io, args: readonly string[]): Promise<number> {
  const [action, ...rest] = args
  if (action === 'start') return start(io, rest)
  if (action === 'note') return addNote(io, rest.join(' '))
  if (action === 'end') return end(io, rest)
  if (action === undefined) {
    const { workspace, store } = await openWorkspace(io.cwd)
    store.close()
    const open = await readActiveSession(workspace.root)
    io.out(open ? `Open: ${open.agent} session ${open.sessionId}, started ${open.startedAt}${open.taskId ? `, task ${open.taskId}` : ''}.` : 'No session is open.')
    return EXIT_OK
  }
  io.err(SESSION_USAGE)
  return EXIT_USAGE
}
