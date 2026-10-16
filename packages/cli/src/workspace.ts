import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTINUUM_DIR, findRepoRoot, gitPath } from '@continuum/capture'
import { ContextStore } from '@continuum/store'

export const STORE_FILE = 'context.db'
const EXCLUDE_ENTRY = `/${CONTINUUM_DIR}/`

export class NotInitializedError extends Error {
  constructor(root: string) {
    super(`Continuum is not set up in ${root}. Run \`continuum init\` first.`)
    this.name = 'NotInitializedError'
  }
}

export interface Workspace {
  root: string
  storePath: string
}

export async function locateWorkspace(cwd: string): Promise<Workspace> {
  const root = await findRepoRoot(cwd)
  return { root, storePath: join(root, CONTINUUM_DIR, STORE_FILE) }
}

export function isInitialized(workspace: Workspace): boolean {
  return existsSync(workspace.storePath)
}

/** Opens the store of an initialized workspace; never creates one implicitly. */
export async function openWorkspace(cwd: string): Promise<{ workspace: Workspace; store: ContextStore }> {
  const workspace = await locateWorkspace(cwd)
  if (!isInitialized(workspace)) throw new NotInitializedError(workspace.root)
  return { workspace, store: ContextStore.open(workspace.storePath) }
}

/**
 * Keeps the store out of git without editing the project's .gitignore:
 * the entry goes in .git/info/exclude, which is local to this clone.
 */
export async function excludeFromGit(root: string): Promise<boolean> {
  const excludePath = await gitPath(root, 'info/exclude')
  const current = existsSync(excludePath) ? await readFile(excludePath, 'utf8') : ''
  if (current.split(/\r?\n/).includes(EXCLUDE_ENTRY)) return false
  await mkdir(join(excludePath, '..'), { recursive: true })
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  await appendFile(excludePath, `${separator}# Continuum local context store\n${EXCLUDE_ENTRY}\n`)
  return true
}

export async function initWorkspace(cwd: string): Promise<{ workspace: Workspace; store: ContextStore; created: boolean }> {
  const workspace = await locateWorkspace(cwd)
  const created = !isInitialized(workspace)
  await excludeFromGit(workspace.root)
  return { workspace, store: ContextStore.open(workspace.storePath), created }
}
