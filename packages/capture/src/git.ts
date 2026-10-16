import { spawn } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContentHash } from '@continuum/core'
import { normalizePath } from '@continuum/store'

/** Directory where a workspace keeps its local context store. Never captured as project content. */
export const CONTINUUM_DIR = '.continuum'

export class NotAGitRepositoryError extends Error {
  constructor(cwd: string) {
    super(`Not inside a git repository: ${cwd}. Continuum tracks git repositories; run \`git init\` first.`)
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
}

/** Runs git without a shell, so paths are never interpreted. */
function git(cwd: string, args: readonly string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString('utf8'))
      else reject(new GitCommandError(args, code, Buffer.concat(stderr).toString('utf8')))
    })
    child.stdin.end(input ?? '')
  })
}

export async function findRepoRoot(cwd: string): Promise<string> {
  try {
    return (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
  } catch (error) {
    if (error instanceof GitCommandError) throw new NotAGitRepositoryError(cwd)
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

/** Lists tracked and untracked-but-not-ignored files that exist on disk as regular files. */
async function listFiles(root: string): Promise<string[]> {
  const listed = (await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0').filter(Boolean)
  const unique = [...new Set(listed.map(normalizePath))].filter(isCapturable)
  const present = await Promise.all(unique.map(async (path) => ((await isRegularFile(root, path)) ? path : null)))
  return present.filter((path): path is string => path !== null)
}

/** Hashes every capturable file exactly as `git add` would, in one batched git call. */
export async function readWorkingTree(root: string): Promise<WorkingTree> {
  const [paths, revision] = await Promise.all([listFiles(root), headRevision(root)])
  if (paths.length === 0) return { root, revision, files: new Map() }
  const hashes = (await git(root, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`)).trim().split('\n')
  if (hashes.length !== paths.length) throw new Error(`git hash-object returned ${hashes.length} hashes for ${paths.length} files`)
  return { root, revision, files: new Map(paths.map((path, index) => [path, hashes[index]])) }
}
