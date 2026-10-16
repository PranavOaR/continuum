import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { hashFiles, isIgnored, isRegularFileInRepo, NotAGitRepositoryError, NotInitializedError, openWorkspace, readWorkingTree, redactSecrets } from '@continuum/capture'
import { currentTaskId, DEFAULT_HANDOFF_CHARS, projectState, renderHandoff, type ProjectState } from '@continuum/context'
import type { ContentHash, IdentityKey, MemoryRecordedEvent } from '@continuum/core'
import { keys, normalizePath, type ContextStore } from '@continuum/store'
import { registerTaskTools, TaskToolError } from './taskTools'

export const SERVER_NAME = 'continuum'
export const MCP_SOURCE = 'mcp'
const MIN_HANDOFF_CHARS = 1_000
const MAX_HANDOFF_CHARS = 20_000
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
async function withStore<T>(cwd: string, work: (store: ContextStore, root: string) => Promise<T>): Promise<T> {
  const { workspace, store } = await openWorkspace(cwd)
  try {
    return await work(store, workspace.root)
  } finally {
    store.close()
  }
}

/** Expected failures become tool errors the agent can read; anything else is a bug and propagates. */
async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ToolInputError || error instanceof TaskToolError || error instanceof NotInitializedError || error instanceof NotAGitRepositoryError) {
      return failure(error.message)
    }
    throw error
  }
}

async function currentState(store: ContextStore, root: string, now: Date): Promise<ProjectState> {
  return projectState(store, await readWorkingTree(root), now)
}

/**
 * Resolves agent-supplied paths (absolute, or relative to the agent's working
 * directory) to repository files and their current hashes, rejecting anything
 * outside what Continuum captures.
 */
async function anchorsFor(root: string, cwd: string, files: readonly string[]): Promise<Record<IdentityKey, ContentHash>> {
  const paths = files.map((file) => normalizePath(relative(root, resolve(cwd, file))))
  const outside = paths.filter((path) => path === '' || path.startsWith('../') || isAbsolute(path))
  if (outside.length > 0) throw new ToolInputError(`Files must be inside the repository: ${outside.join(', ')}`)
  const notFiles = (await Promise.all(paths.map(async (path) => ((await isRegularFileInRepo(root, path)) ? null : path)))).filter(Boolean)
  if (notFiles.length > 0) throw new ToolInputError(`Files not found (symlinks are not followed): ${notFiles.join(', ')}`)
  const ignored = (await Promise.all(paths.map(async (path) => ((await isIgnored(root, path)) ? path : null)))).filter(Boolean)
  if (ignored.length > 0) throw new ToolInputError(`Files ignored by git cannot anchor a decision: ${ignored.join(', ')}`)
  const hashes = await hashFiles(root, paths)
  const vanished = paths.filter((path) => !hashes.has(path))
  if (vanished.length > 0) throw new ToolInputError(`Files not found: ${vanished.join(', ')}`)
  return Object.fromEntries([...hashes].map(([path, hash]) => [keys.file(path), hash]))
}

const recordDecisionInput = {
  title: z.string().trim().min(1).max(200).describe('One line: what was decided or learned'),
  body: z.string().max(4_000).default('').describe('Why, alternatives rejected, or what to do next'),
  kind: z.enum(['decision', 'known-issue', 'previous-attempt', 'next-action']).default('decision'),
  files: z
    .array(z.string().min(1))
    .max(MAX_ANCHORED_FILES)
    .default([])
    .describe('Repository files this applies to. If any later change, the note is flagged as possibly stale.'),
}

/**
 * The Continuum MCP server. Read tools never write; record_decision is the only
 * write, and it is labelled agent-reported so it is never mistaken for verified fact.
 */
export function createContinuumServer(options: ServerOptions): McpServer {
  const now = options.now ?? (() => new Date())
  const server = new McpServer({ name: SERVER_NAME, version: options.version })

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
        withStore(options.cwd, async (store, root) => {
          const anchors = await anchorsFor(root, options.cwd, files)
          const id = randomUUID()
          // Decisions belong to the task being worked on, read under the same lock that records them.
          store.transact(() => {
            const taskId = currentTaskId(store, now())
            const event: MemoryRecordedEvent = {
              type: 'memory.recorded',
              payload: { id, kind, title: redactSecrets(title), body: redactSecrets(body), anchors, ...(taskId ? { taskId } : {}) },
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

  registerTaskTools(server, (work) => guarded(() => withStore(options.cwd, async (store) => ok(await work(store)))), now)

  return server
}
