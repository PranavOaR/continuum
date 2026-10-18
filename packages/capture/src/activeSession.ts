import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentType } from '@continuum/core'
import { CONTINUUM_DIR } from './git'

/**
 * The session opened with `continuum session start`, for agents without hooks
 * (Codex, Cursor, a chat). Scans attribute file changes to it until it ends.
 */
export const ACTIVE_SESSION_FILE = 'active-session.json'

export interface ActiveSession {
  sessionId: string
  agent: AgentType
  taskId?: string
  startedAt: string
}

const AGENT_TYPES = new Set(['claude-code', 'codex', 'cursor', 'chatgpt', 'other'])
const pathOf = (root: string) => join(root, CONTINUUM_DIR, ACTIVE_SESSION_FILE)

/** A missing or malformed file means no open session. */
export async function readActiveSession(root: string): Promise<ActiveSession | null> {
  const path = pathOf(root)
  if (!existsSync(path)) return null
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<ActiveSession>
    if (typeof value.sessionId !== 'string' || typeof value.agent !== 'string' || !AGENT_TYPES.has(value.agent) || typeof value.startedAt !== 'string') return null
    return { sessionId: value.sessionId, agent: value.agent as AgentType, startedAt: value.startedAt, ...(typeof value.taskId === 'string' ? { taskId: value.taskId } : {}) }
  } catch {
    return null
  }
}

/**
 * Opens the session file only if none exists, in one step ('wx'), so two
 * `session start`s at once cannot both succeed. Returns false when one is open.
 */
export async function claimActiveSession(root: string, session: ActiveSession): Promise<boolean> {
  try {
    await writeFile(pathOf(root), `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

export async function clearActiveSession(root: string): Promise<void> {
  await rm(pathOf(root), { force: true })
}
