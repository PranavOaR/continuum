import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { extractSymbols, hashFiles, InvalidConfigError, isIgnored, isRegularFileInRepo, loadContinuumIgnore, NotAGitRepositoryError, NotInitializedError, openWorkspace, parseSymbolRef, readWorkingTreeWithSymbols, repositoryRedactor, UnreadableIgnoreFileError, type Redactor } from '@continuum/capture'
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_HANDOFF_CHARS, openSessionId, projectState, rankContext, renderContext, renderHandoff, renderSearch, searchMemory, shareable, taskIdOfSession, type ProjectState } from '@continuum/context'
import type { ContentHash, IdentityKey, MemoryRecordedEvent } from '@continuum/core'
import { keys, normalizePath, type ContextStore } from '@continuum/store'
import { registerTaskTools, TaskToolError } from './taskTools'

export const SERVER_NAME = 'continuum'
export const MCP_SOURCE = 'mcp'
const MIN_HANDOFF_CHARS = 1_000
const MAX_HANDOFF_CHARS = 20_000
const MIN_CONTEXT_TOKENS = 200
const MAX_CONTEXT_TOKENS = 8_000
const MAX_LISTED_UNRECORDED = 50
const MAX_ANCHORED_FILES = 50
const MAX_QUERY_CHARS = 200
const DEFAULT_SEARCH_RESULTS = 8
const MAX_SEARCH_RESULTS = 25
/**
 * Claude Code starts one MCP server per session with this set, to the id its
 * hooks report, also after --resume. It is fixed at the start, and child
 * processes inherit it, so it is only a hint: see openSessionId.
 */
const SESSION_ID_ENV = 'CLAUDE_CODE_SESSION_ID'

/** Codex sets no variable (0.149) but names the session on each call, under this `_meta` key. It is undocumented, so anything else falls back. */
const CODEX_TURN_META = 'x-codex-turn-metadata'

export interface ServerOptions {
  /** Directory the agent works in; the repository is resolved from it on every call. */
  cwd: string
  version: string
  now?: () => Date
  /** The session this server works for, when its client says; tools then act on that session's task. */
  sessionId?: string
}

/** The agent session this process serves, if its client named one. */
export function callingSessionId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[SESSION_ID_ENV]?.trim() || undefined
}

type CallExtra = { _meta?: Record<string, unknown> }

/** The session behind one tool call: the one the call names, otherwise the one this server started with. */
export function sessionOfCall(meta: Readonly<Record<string, unknown>> | undefined, serverSession?: string): string | undefined {
  const turn = meta?.[CODEX_TURN_META]
  const id = typeof turn === 'object' && turn !== null ? (turn as { session_id?: unknown }).session_id : undefined
  return (typeof id === 'string' && id.trim()) || serverSession
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })
const failure = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}

/** Opens the store for one call and always closes it, so the server never holds the database between calls. */
async function withStore<T>(cwd: string, work: (store: ContextStore, root: string, redactor: Redactor) => Promise<T>): Promise<T> {
  const { workspace, store } = await openWorkspace(cwd)
  try {
    return await work(store, workspace.root, await repositoryRedactor(workspace.root))
  } finally {
    store.close()
  }
}

const EXPECTED_ERRORS = [ToolInputError, TaskToolError, NotInitializedError, NotAGitRepositoryError, InvalidConfigError, UnreadableIgnoreFileError]

/** Expected failures become tool errors the agent can read; anything else is a bug and propagates. */
async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run()
  } catch (error) {
    if (EXPECTED_ERRORS.some((type) => error instanceof type)) return failure((error as Error).message)
    throw error
  }
}

async function currentState(store: ContextStore, root: string, now: Date): Promise<ProjectState> {
  return projectState(store, await readWorkingTreeWithSymbols(store, root), now)
}

/** Most symbols listed when a requested one is not in the file. */
const MAX_SUGGESTED_SYMBOLS = 20

/**
 * Resolves agent-supplied paths (absolute, or relative to the agent's working
 * directory) to repository files and their current hashes, rejecting anything
 * outside what Continuum captures. `path#name` anchors to one top-level symbol
 * instead, so the note goes stale only when that symbol changes.
 */
async function anchorsFor(root: string, cwd: string, entries: readonly string[]): Promise<Record<IdentityKey, ContentHash>> {
  const toPath = (file: string) => normalizePath(relative(root, resolve(cwd, file)))
  const refs = await Promise.all(
    entries.map(async (entry) => {
      // A file whose name contains # (docs/a#b.md) is a file, not a symbol reference.
      const symbol = (await isRegularFileInRepo(root, toPath(entry))) ? null : parseSymbolRef(entry)
      return { path: toPath(symbol?.path ?? entry), symbol: symbol?.name ?? null }
    }),
  )
  const paths = [...new Set(refs.map((ref) => ref.path))]
  const outside = paths.filter((path) => path === '' || path.startsWith('../') || isAbsolute(path))
  if (outside.length > 0) throw new ToolInputError(`Files must be inside the repository: ${outside.join(', ')}`)
  const notFiles = (await Promise.all(paths.map(async (path) => ((await isRegularFileInRepo(root, path)) ? null : path)))).filter(Boolean)
  if (notFiles.length > 0) throw new ToolInputError(`Files not found (symlinks are not followed): ${notFiles.join(', ')}`)
  const ignored = (await Promise.all(paths.map(async (path) => ((await isIgnored(root, path)) ? path : null)))).filter(Boolean)
  if (ignored.length > 0) throw new ToolInputError(`Files ignored by git cannot anchor a decision: ${ignored.join(', ')}`)

  const filePaths = refs.filter((ref) => ref.symbol === null).map((ref) => ref.path)
  const hashes = await hashFiles(root, filePaths)
  const vanished = filePaths.filter((path) => !hashes.has(path))
  if (vanished.length > 0) throw new ToolInputError(`Files not found: ${vanished.join(', ')}`)
  const anchors: Record<IdentityKey, ContentHash> = Object.fromEntries([...hashes].map(([path, hash]) => [keys.file(path), hash]))

  for (const ref of refs) {
    if (ref.symbol === null) continue
    const symbols = extractSymbols(ref.path, await readFile(join(root, ref.path), 'utf8'))
    if (!symbols) throw new ToolInputError(`Cannot read the symbols in ${ref.path}; anchor the whole file instead.`)
    const found = symbols.find((candidate) => candidate.name === ref.symbol)
    if (!found) {
      const names = symbols.slice(0, MAX_SUGGESTED_SYMBOLS).map((candidate) => candidate.name).join(', ')
      throw new ToolInputError(`No top-level "${ref.symbol}" in ${ref.path}. Its symbols: ${names || 'none'}.`)
    }
    anchors[keys.symbol(ref.path, found.name)] = found.hash
  }
  return anchors
}

const recordDecisionInput = {
  title: z.string().trim().min(1).max(200).describe('One line: what was decided or learned'),
  body: z.string().max(4_000).default('').describe('Why, alternatives rejected, or what to do next'),
  kind: z.enum(['decision', 'known-issue', 'previous-attempt', 'next-action']).default('decision'),
  files: z
    .array(z.string().min(1))
    .max(MAX_ANCHORED_FILES)
    .default([])
    .describe('Repository files this applies to, or one top-level function/class/constant as path#name (e.g. src/auth.ts#login). If any later change, the note is flagged as possibly stale; a symbol anchor ignores edits elsewhere in its file.'),
}

/**
 * The Continuum MCP server. Read tools never write; record_decision and the task
 * tools are the only writes, labelled agent-reported so they are never mistaken for verified fact.
 */
export function createContinuumServer(options: ServerOptions): McpServer {
  const now = options.now ?? (() => new Date())
  const sessionOf = (extra: CallExtra) => sessionOfCall(extra._meta, options.sessionId)
  const server = new McpServer({ name: SERVER_NAME, version: options.version })

  server.registerTool(
    'get_context',
    {
      title: 'Get ranked context',
      description:
        'The recorded context most useful for a task, ranked and cut to a token budget: the task, failing or out-of-date checks, decisions anchored to the files it touches, recent session notes, hand edits and commits. Each line shows its score and why. Pass `query` with what you are about to work on, and decisions and notes holding those words rank higher, whichever task they were recorded on. Use it to focus before working on a task; get_handoff gives the full overview.',
      inputSchema: {
        task_id: z.string().trim().min(1).max(100).optional().describe('Defaults to the current task'),
        query: z.string().trim().min(1).max(MAX_QUERY_CHARS).optional().describe('A few words on what you are about to do, e.g. "webhook retries"'),
        budget_tokens: z.number().int().min(MIN_CONTEXT_TOKENS).max(MAX_CONTEXT_TOKENS).optional().describe(`Defaults to ${DEFAULT_CONTEXT_TOKENS}`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ task_id, budget_tokens, query }, extra) =>
      guarded(() =>
        withStore(options.cwd, async (store, root, { redact }) => {
          const at = now()
          const state = await currentState(store, root, at)
          if (task_id && !state.tasks.some((task) => task.id === task_id)) throw new ToolInputError(`No task "${task_id}".`)
          const taskId = task_id ?? taskIdOfSession(store, openSessionId(store, sessionOf(extra)), at)
          const ranked = rankContext(store, state, { now: at, ...(taskId ? { taskId } : {}), ...(query ? { query } : {}) })
          // The query's words are echoed in each line's reason, so the reply is masked like anything recorded.
          return ok(query ? redact(renderContext(ranked, budget_tokens ?? DEFAULT_CONTEXT_TOKENS)) : renderContext(ranked, budget_tokens ?? DEFAULT_CONTEXT_TOKENS))
        }),
      ),
  )

  server.registerTool(
    'search_memory',
    {
      title: 'Search memory',
      description:
        'Search everything recorded in this repository for some words: decisions, known issues, failed attempts, tasks and session notes, including old ones on other tasks that a briefing no longer shows. Each result carries its evidence label, when it was recorded, the task and code it belongs to, and whether that code changed since. Use it before deciding something that may already have been decided, or when the user asks what was done about something.',
      inputSchema: {
        query: z.string().trim().min(1).max(MAX_QUERY_CHARS).describe('Words to look for, e.g. "webhook idempotency"'),
        limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional().describe(`Defaults to ${DEFAULT_SEARCH_RESULTS}`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) =>
      guarded(() =>
        withStore(options.cwd, async (store, root, { redact }) => {
          const at = now()
          const results = searchMemory(store, await currentState(store, root, at), query, { limit: limit ?? DEFAULT_SEARCH_RESULTS })
          // Shown the way capture stores: masked by today's redaction rules, with nothing .continuumignore lists.
          return ok(redact(renderSearch(shareable(results, { redact, isIgnored: await loadContinuumIgnore(root) }), query, at)))
        }),
      ),
  )

  server.registerTool(
    'get_handoff',
    {
      title: 'Get handoff',
      description:
        'Where this project left off: the latest agent session and its last note, files it changed, test/lint/build results judged against the code as it is now (verified vs out of date), recorded decisions, and unrecorded changes. Call this at the start of work or before resuming a task.',
      inputSchema: { max_chars: z.number().int().min(MIN_HANDOFF_CHARS).max(MAX_HANDOFF_CHARS).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ max_chars }) =>
      guarded(() =>
        withStore(options.cwd, async (store, root) => {
          const at = now()
          return ok(renderHandoff(await currentState(store, root, at), { now: at, maxChars: max_chars ?? DEFAULT_HANDOFF_CHARS }))
        }),
      ),
  )

  server.registerTool(
    'get_project_state',
    {
      title: 'Get project state',
      description: 'The full structured project state as JSON: sessions, checks with the files changed since they ran, decisions with anchor status, and unrecorded changes.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      guarded(() =>
        withStore(options.cwd, async (store, root) => {
          // Records you resolved stay out of everything an agent is told.
          const { resolvedDecisions: _resolved, ...state } = await currentState(store, root, now())
          const unrecorded = state.files.unrecorded
          const bounded = {
            ...state,
            files: { ...state.files, unrecorded: unrecorded.slice(0, MAX_LISTED_UNRECORDED), unrecordedTotal: unrecorded.length },
          }
          return ok(JSON.stringify(bounded, null, 2))
        }),
      ),
  )

  server.registerTool(
    'record_decision',
    {
      title: 'Record decision',
      description:
        'Save a decision, known issue, failed attempt or next action to the project memory so the next session (or another agent) sees it in the handoff. Anchor it to the files it concerns.',
      inputSchema: recordDecisionInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title, body, kind, files }, extra) =>
      guarded(() =>
        withStore(options.cwd, async (store, root, { redact }) => {
          const anchors = await anchorsFor(root, options.cwd, files)
          const id = randomUUID()
          // Decisions belong to the task this session is working on, read under the same lock that records them.
          store.transact(() => {
            const taskId = taskIdOfSession(store, openSessionId(store, sessionOf(extra)), now())
            const event: MemoryRecordedEvent = {
              type: 'memory.recorded',
              payload: { id, kind, title: redact(title), body: redact(body), anchors, ...(taskId ? { taskId } : {}) },
              evidence: 'agent-reported',
              source: MCP_SOURCE,
              occurredAt: now().toISOString(),
            }
            return [event]
          })
          const anchored = Object.keys(anchors).length
          return ok(`Recorded ${kind} ${id}${anchored > 0 ? `, anchored to ${anchored} file${anchored === 1 ? '' : 's'}` : ''}. It will appear in future handoffs.`)
        }),
      ),
  )

  registerTaskTools(server, (work) => guarded(() => withStore(options.cwd, async (store, _root, { redact }) => ok(await work(store, redact)))), now, sessionOf)

  return server
}
