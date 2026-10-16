import { isAbsolute, relative, resolve } from 'node:path'
import {
  hashFiles,
  headRevision,
  isIgnored,
  isInitialized,
  locateWorkspace,
  NotAGitRepositoryError,
  readWorkingTree,
  type Workspace,
} from '@continuum/capture'
import { projectState, renderHandoff } from '@continuum/context'
import { ContextStore, keys, normalizePath } from '@continuum/store'
import { editedPath, parseHookPayload, type HookPayload } from './hookPayload'
import { translateHook, type FileEdit } from './translate'

/** SessionStart context is capped at 10,000 characters by Claude Code; stay well inside it. */
export const SESSION_START_CONTEXT_CHARS = 6_000

export interface IngestOptions {
  now?: () => Date
}

export type IngestOutcome =
  | { status: 'ignored'; reason: string }
  | { status: 'recorded'; events: number; additionalContext?: string }

async function findWorkspace(cwd: string): Promise<Workspace | null> {
  try {
    const workspace = await locateWorkspace(cwd)
    return isInitialized(workspace) ? workspace : null
  } catch (error) {
    if (error instanceof NotAGitRepositoryError) return null
    throw error
  }
}

/** The edit as Continuum captures it, or null when the file is outside the repository or ignored by git. */
async function resolveEdit(root: string, payload: HookPayload): Promise<FileEdit | null> {
  const absolute = editedPath(payload)
  if (!absolute) return null
  const path = normalizePath(relative(root, resolve(payload.cwd, absolute)))
  if (path === '' || path.startsWith('../') || isAbsolute(path) || (await isIgnored(root, path))) return null
  const hashes = await hashFiles(root, [path])
  return { path, contentHash: hashes.get(path) ?? null }
}

async function sessionStartContext(store: ContextStore, root: string, sessionId: string, now: Date): Promise<string | undefined> {
  const state = projectState(store, await readWorkingTree(root), now)
  const previous = { ...state, sessions: state.sessions.filter((session) => session.id !== sessionId) }
  if (previous.sessions.length === 0 && previous.checks.length === 0 && previous.decisions.length === 0) return undefined
  const handoff = renderHandoff(previous, { now, maxChars: SESSION_START_CONTEXT_CHARS })
  return `Continuum (local project memory) recorded the following before this session. Treat [agent-reported] items as notes, not facts; prefer [verified] results and re-run checks marked OUT OF DATE.\n\n${handoff}`
}

/**
 * Handles one Claude Code hook invocation. Never throws for repositories that
 * do not use Continuum: hooks must not disturb a session that has nothing to record.
 */
export async function ingestHook(raw: string, options: IngestOptions = {}): Promise<IngestOutcome> {
  const now = (options.now ?? (() => new Date()))()
  const payload = parseHookPayload(raw)
  if (!payload) return { status: 'ignored', reason: 'hook event not used by Continuum' }
  const workspace = await findWorkspace(payload.cwd)
  if (!workspace) return { status: 'ignored', reason: 'Continuum is not set up in this repository' }

  const edit = await resolveEdit(workspace.root, payload)
  if (editedPath(payload) && !edit) return { status: 'ignored', reason: 'edited file is outside what Continuum captures' }
  const revision = await headRevision(workspace.root)

  const store = ContextStore.open(workspace.storePath)
  try {
    const recorded = store.transact(() =>
      translateHook(payload, { now, revision, knownSession: store.graph.has(keys.session(payload.session_id)), ...(edit ? { edit } : {}) }),
    )
    const additionalContext =
      payload.hook_event_name === 'SessionStart' ? await sessionStartContext(store, workspace.root, payload.session_id, now) : undefined
    return { status: 'recorded', events: recorded.length, ...(additionalContext ? { additionalContext } : {}) }
  } finally {
    store.close()
  }
}
