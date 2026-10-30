import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { extractSymbols, hashFiles, InvalidConfigError, isIgnored, isRegularFileInRepo, NotAGitRepositoryError, NotInitializedError, openWorkspace, parseSymbolRef, readWorkingTreeWithSymbols, repositoryRedactor, type Redactor } from '@continuum/capture'
import { currentTaskId, DEFAULT_CONTEXT_TOKENS, DEFAULT_HANDOFF_CHARS, projectState, rankContext, renderContext, renderHandoff, type ProjectState } from '@continuum/context'
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

export interface ServerOptions {
  /** Directory the agent works in; the repository is resolved from it on every call. */
  cwd: string
  version: string
  now?: () => Date
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

/** Expected failures become tool errors the agent can read; anything else is a bug and propagates. */
async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ToolInputError || error instanceof TaskToolError || error instanceof NotInitializedError || error instanceof NotAGitRepositoryError || error instanceof InvalidConfigError) {
      return failure(error.message)
    }
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
 * The Continuum MCP server. Read tools never write; record_decision is the only
 * write, and it is labelled agent-reported so it is never mistaken for verified fact.
 */
export function createContinuumServer(options: ServerOptions): McpServer {
  const now = options.now ?? (() => new Date())
  const server = new McpServer({ name: SERVER_NAME, version: options.version })

  server.registerTool(
    'get_context',
    {
      title: 'Get ranked context',
      description:
        'The recorded context most useful for a task, ranked and cut to a token budget: the task, failing or out-of-date checks, decisions anchored to the files it touches, recent session notes, hand edits and commits. Each line shows its score and why. Use it to focus before working on a task; get_handoff gives the full overview.',
      inputSchema: {
        task_id: z.string().trim().min(1).max(100).optional().describe('Defaults to the current task'),
        budget_tokens: z.number().int().min(MIN_CONTEXT_TOKENS).max(MAX_CONTEXT_TOKENS).optional().describe(`Defaults to ${DEFAULT_CONTEXT_TOKENS}`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ task_id, budget_tokens }) =>
      guarded(() =>
        withStore(options.cwd, async (store, root) => {
          const at = now()
          const state = await currentState(store, root, at)
          if (task_id && !state.tasks.some((task) => task.id === task_id)) throw new ToolInputError(`No task "${task_id}".`)
          return ok(renderContext(rankContext(store, state, { now: at, ...(task_id ? { taskId: task_id } : {}) }), budget_tokens ?? DEFAULT_CONTEXT_TOKENS))
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
          const state = await currentState(store, root, now())
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
    async ({ title, body, kind, files }) =>
      guarded(() =>
        withStore(options.cwd, async (store, root, { redact }) => {
          const anchors = await anchorsFor(root, options.cwd, files)
          const id = randomUUID()
          // Decisions belong to the task being worked on, read under the same lock that records them.
          store.transact(() => {
            const taskId = currentTaskId(store, now())
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

  registerTaskTools(server, (work) => guarded(() => withStore(options.cwd, async (store, _root, { redact }) => ok(await work(store, redact)))), now)

  return server
}
