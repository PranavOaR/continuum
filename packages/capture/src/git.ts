import { spawn } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { ContentHash } from '@continuum/core'
import { normalizePath } from '@continuum/store'
import { loadContinuumIgnore } from './continuumIgnore'

/** Directory where a workspace keeps its local context store. Never captured as project content. */
export const CONTINUUM_DIR = '.continuum'

export class NotAGitRepositoryError extends Error {
  /** `cause` is git's own failure, which says whether git ran at all. */
  constructor(cwd: string, options?: ErrorOptions) {
    super(`Not inside a git repository: ${cwd}. Continuum tracks git repositories; run \`git init\` first.`, options)
    this.name = 'NotAGitRepositoryError'
  }
}

export class GitCommandError extends Error {
  readonly exitCode: number | null
  constructor(args: readonly string[], exitCode: number | null, stderr: string) {
    super(`git ${args.join(' ')} failed (exit ${exitCode ?? 'signal'}): ${stderr.trim()}`)
    this.name = 'GitCommandError'
    this.exitCode = exitCode
  }
}

/** Path → git blob hash of its current working-tree content. */
export interface WorkingTree {
  root: string
  revision: string | null
  files: ReadonlyMap<string, ContentHash>
  /** Current hashes of anchored symbols (`symbol:path#name`), when the caller asked for them. */
  symbols?: ReadonlyMap<string, ContentHash>
}

/** Runs git without a shell, so paths are never interpreted. */
function git(cwd: string, args: readonly string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Only open stdin when there is input: writing to a git that already exited raises EPIPE.
    const child = spawn('git', args, { cwd, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'))
      else reject(new GitCommandError(args, code, Buffer.concat(stderr).toString('utf8')))
    })
    if (child.stdin) {
      // git may exit early (e.g. a vanished path); its exit code is the real error, not the broken pipe.
      child.stdin.on('error', () => {})
      child.stdin.end(input)
    }
  })
}

/** Runs a git command in `cwd` and returns its stdout; rejects with GitCommandError on a non-zero exit. */
export const gitOutput = git

export async function findRepoRoot(cwd: string): Promise<string> {
  try {
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
  } catch (error) {
    if (error instanceof GitCommandError) throw new NotAGitRepositoryError(cwd, { cause: error })
    throw error
  }
}

/** Short sha of HEAD, or null before the first commit. */
export async function headRevision(root: string): Promise<string | null> {
  try {
    return (await git(root, ['rev-parse', '--short', '--verify', '--quiet', 'HEAD'])).trim() || null
  } catch (error) {
    if (error instanceof GitCommandError) return null
    throw error
  }
}

/** The checked-out branch, or null when HEAD is detached. */
export async function currentBranch(root: string): Promise<string | null> {
  try {
    const name = (await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
    return name || null
  } catch (error) {
    if (error instanceof GitCommandError) return null
    throw error
  }
}

/** Absolute path of a file inside the git directory, correct for worktrees too. */
export async function gitPath(root: string, path: string): Promise<string> {
  const resolved = (await git(root, ['rev-parse', '--git-path', path])).trim()
  return resolved.startsWith('/') ? resolved : join(root, resolved)
}

function isCapturable(path: string): boolean {
  return !path.includes('\n') && path !== CONTINUUM_DIR && !path.startsWith(`${CONTINUUM_DIR}/`)
}

async function isRegularFile(root: string, path: string): Promise<boolean> {
  try {
    return (await lstat(join(root, path))).isFile()
  } catch {
    return false // listed by git but deleted from disk
  }
}

/** Whether git ignores a repository-relative path, matching what scans capture: tracked files are never ignored. `.continuum/` always is. */
export async function isIgnored(root: string, path: string): Promise<boolean> {
  if (!isCapturable(path) || (await loadContinuumIgnore(root))(path)) return true
  try {
    await git(root, ['check-ignore', '--quiet', '--', path])
    return true
  } catch (error) {
    if (error instanceof GitCommandError && error.exitCode === 1) return false
    throw error
  }
}

/**
 * Whether a repository-relative path is a regular file physically inside the
 * repository: not a symlink, and not reached through a symlinked directory.
 * Scans never follow symlinks, so agent-reported paths must not either.
 */
export async function isRegularFileInRepo(root: string, path: string): Promise<boolean> {
  try {
    const absolute = join(root, path)
    const [stats, resolved, resolvedRoot] = await Promise.all([lstat(absolute), realpath(absolute), realpath(root)])
    return stats.isFile() && resolved.startsWith(resolvedRoot + sep)
  } catch {
    return false
  }
}

/** Whether git tracks a repository-relative path (it is in the index). */
export async function isTracked(root: string, path: string): Promise<boolean> {
  try {
    await git(root, ['ls-files', '--error-unmatch', '--', path])
    return true
  } catch (error) {
    if (error instanceof GitCommandError && error.exitCode === 1) return false
    throw error
  }
}

async function hashBatch(root: string, paths: readonly string[]): Promise<Map<string, ContentHash>> {
  const hashes = (await git(root, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`)).trim().split('\n')
  if (hashes.length !== paths.length) throw new Error(`git hash-object returned ${hashes.length} hashes for ${paths.length} files`)
  return new Map(paths.map((path, index) => [path, hashes[index]]))
}

async function hashOne(root: string, path: string): Promise<ContentHash | null> {
  try {
    return (await git(root, ['hash-object', '--', path])).trim()
  } catch (error) {
    if (error instanceof GitCommandError && !(await isRegularFile(root, path))) return null // vanished meanwhile
    throw error
  }
}

/**
 * Hashes files exactly as `git add` would: one batched call, falling back to
 * per-file hashing when a file disappears between listing and hashing
 * (editor swap files, build output), so one vanished file never fails a scan.
 */
export async function hashFiles(root: string, paths: readonly string[]): Promise<Map<string, ContentHash>> {
  if (paths.length === 0) return new Map()
  try {
    return await hashBatch(root, paths)
  } catch (error) {
    if (!(error instanceof GitCommandError)) throw error
    const hashed = await Promise.all(paths.map(async (path) => [path, await hashOne(root, path)] as const))
    return new Map(hashed.filter((entry): entry is readonly [string, ContentHash] => entry[1] !== null))
  }
}

/** Index modes of entries that are regular files; symlinks (120000) and submodules (160000) are never captured. */
const REGULAR_MODES = new Set(['100644', '100755'])

interface IndexEntry {
  mode: string
  hash: ContentHash
  /** Sparse checkout: git does not expect the file on disk and never reports it as changed. */
  skipWorktree: boolean
}

/** Stage-0 index entries; conflicted paths are left to `changedPaths`. */
async function readIndex(root: string): Promise<Map<string, IndexEntry>> {
  const entries = new Map<string, IndexEntry>()
  for (const record of (await git(root, ['ls-files', '-z', '--stage', '-t'])).split('\0')) {
    const match = /^(\S) (\d{6}) ([0-9a-f]+) 0\t(.+)$/s.exec(record)
    if (match) entries.set(normalizePath(match[4]), { mode: match[2], hash: match[3], skipWorktree: match[1] === 'S' })
  }
  return entries
}

/** Fields before the path in each `git status --porcelain=v2` record type. */
const STATUS_FIELDS: Record<string, number> = { '1': 8, '2': 9, u: 10 }

/**
 * Paths whose working-tree content may differ from the index (modified, type-
 * changed, deleted, conflicted) plus untracked, not-ignored files. Does not
 * take the index lock, so it never blocks or races the user's own git commands.
 */
async function changedPaths(root: string): Promise<string[]> {
  const records = (await git(root, ['--no-optional-locks', 'status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignore-submodules=all'])).split('\0')
  const paths: string[] = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const type = record[0]
    if (type === '?') paths.push(record.slice(2))
    else if (type in STATUS_FIELDS) {
      const fields = record.split(' ')
      const worktreeChanged = type === 'u' || fields[1][1] !== '.'
      if (worktreeChanged) paths.push(fields.slice(STATUS_FIELDS[type]).join(' '))
      if (type === '2') index += 1 // a rename or copy is followed by its original path
    }
  }
  return paths.map(normalizePath)
}

/**
 * Hashes the working tree as `git add` would, without reading every file:
 * clean tracked files take their blob hash from the index, and only files git
 * reports as changed or untracked are hashed from disk.
 */
export async function readWorkingTree(root: string): Promise<WorkingTree> {
  const [index, changed, revision, isContinuumIgnored] = await Promise.all([readIndex(root), changedPaths(root), headRevision(root), loadContinuumIgnore(root)])
  const fromDisk = new Set(changed)
  const files = new Map<string, ContentHash>()
  for (const [path, entry] of index) {
    if (entry.skipWorktree) fromDisk.add(path)
    else if (!fromDisk.has(path) && REGULAR_MODES.has(entry.mode) && isCapturable(path) && !isContinuumIgnored(path)) files.set(path, entry.hash)
  }
  const candidates = [...fromDisk].filter((path) => isCapturable(path) && !isContinuumIgnored(path))
  const present = (await Promise.all(candidates.map(async (path) => ((await isRegularFile(root, path)) ? path : null)))).filter((path): path is string => path !== null)
  for (const [path, hash] of await hashFiles(root, present)) files.set(path, hash)
  return { root, revision, files: new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) }
}
