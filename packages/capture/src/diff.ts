import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DiffLine } from '@continuum/core'
import { loadContinuumIgnore, type IgnorePredicate } from './continuumIgnore'
import { gitOutput, isRegularFileInRepo } from './git'
import { repositoryRedactor } from './config'
import type { Redactor } from './redact'

/** Lines of patch kept per file: enough to recognize the change, bounded for the dashboard. */
export const MAX_EXCERPT_LINES = 80
/** Above this many changed lines in total, only counts are read; the patch would be too large to be useful. */
export const MAX_PATCH_LINES = 20_000
/** Untracked files larger than this are counted as changed but not read. */
const MAX_UNTRACKED_BYTES = 256 * 1024
const MAX_UNTRACKED_FILES = 200

/** One file's uncommitted change against the last commit. */
export interface UncommittedDiff {
  /** Null for binary files, where git reports no line counts. */
  additions: number | null
  deletions: number | null
  excerpt: DiffLine[]
  truncated: boolean
}

async function base(root: string): Promise<string> {
  try {
    return (await gitOutput(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])).trim()
  } catch {
    // No commits yet: compare against the empty tree.
    return (await gitOutput(root, ['hash-object', '-t', 'tree', '--stdin'], '')).trim()
  }
}

function parseNumstat(output: string): Map<string, UncommittedDiff> {
  const diffs = new Map<string, UncommittedDiff>()
  for (const record of output.split('\0')) {
    const match = /^(-|\d+)\t(-|\d+)\t(.+)$/s.exec(record)
    if (!match) continue
    const count = (value: string) => (value === '-' ? null : Number(value))
    diffs.set(match[3], { additions: count(match[1]), deletions: count(match[2]), excerpt: [], truncated: false })
  }
  return diffs
}

/** Splits `git diff` output into per-file excerpts, keyed by the post-image path (pre-image for deletions). */
function parsePatch(patch: string, redactor: Redactor): Map<string, { excerpt: DiffLine[]; truncated: boolean }> {
  const files = new Map<string, { excerpt: DiffLine[]; truncated: boolean }>()
  let current: { excerpt: DiffLine[]; truncated: boolean } | null = null
  let oldPath: string | null = null
  let inHunk = false
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null
      inHunk = false
    } else if (!inHunk && line.startsWith('--- ')) {
      // Git appends a tab to header paths that contain whitespace.
      oldPath = line === '--- /dev/null' ? null : line.slice('--- a/'.length).replace(/\t$/, '')
    } else if (!inHunk && line.startsWith('+++ ')) {
      const path = line === '+++ /dev/null' ? oldPath : line.slice('+++ b/'.length).replace(/\t$/, '')
      current = path ? { excerpt: [], truncated: false } : null
      if (path && current) files.set(path, current)
    } else if (line.startsWith('@@')) {
      inHunk = true
    } else if (current && inHunk && /^[ +-]/.test(line)) {
      if (current.excerpt.length >= MAX_EXCERPT_LINES) current.truncated = true
      else current.excerpt.push({ kind: line[0] === '+' ? 'add' : line[0] === '-' ? 'remove' : 'context', text: redactor.redact(line.slice(1)) })
    }
  }
  return files
}

async function untrackedDiffs(root: string, isContinuumIgnored: IgnorePredicate, redactor: Redactor): Promise<Map<string, UncommittedDiff>> {
  const paths = (await gitOutput(root, ['ls-files', '-z', '--others', '--exclude-standard'])).split('\0').filter((path) => path !== '' && !isContinuumIgnored(path)).slice(0, MAX_UNTRACKED_FILES)
  const entries = await Promise.all(
    paths.map(async (path): Promise<[string, UncommittedDiff] | null> => {
      try {
        // Never follow a symlink out of the repository (e.g. to ~/.ssh) or into a FIFO.
        if (!(await isRegularFileInRepo(root, path))) return null
        const content = await readFile(join(root, path))
        if (content.length > MAX_UNTRACKED_BYTES || content.includes(0)) return [path, { additions: null, deletions: null, excerpt: [], truncated: false }]
        const lines = content.toString('utf8').split('\n')
        if (lines.at(-1) === '') lines.pop()
        return [path, { additions: lines.length, deletions: 0, excerpt: lines.slice(0, MAX_EXCERPT_LINES).map((text) => ({ kind: 'add', text: redactor.redact(text) })), truncated: lines.length > MAX_EXCERPT_LINES }]
      } catch {
        return null // removed since it was listed
      }
    }),
  )
  return new Map(entries.filter((entry): entry is [string, UncommittedDiff] => entry !== null))
}

/**
 * What git can show of each file's uncommitted change: line counts and a
 * bounded excerpt against the last commit, for tracked and untracked files.
 * Continuum never stores file contents, so this is read live from the repository.
 */
export async function uncommittedChanges(root: string): Promise<Map<string, UncommittedDiff>> {
  const [against, isContinuumIgnored, redactor] = await Promise.all([base(root), loadContinuumIgnore(root), repositoryRedactor(root)])
  const options = ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--no-renames']
  const tracked = parseNumstat(await gitOutput(root, [...options, '--numstat', '-z', against]))
  const changedLines = [...tracked.values()].reduce((total, diff) => total + (diff.additions ?? 0) + (diff.deletions ?? 0), 0)
  if (tracked.size > 0 && changedLines <= MAX_PATCH_LINES) {
    for (const [path, excerpt] of parsePatch(await gitOutput(root, [...options, '-U3', against]), redactor)) {
      const counts = tracked.get(path)
      if (counts) tracked.set(path, { ...counts, ...excerpt })
    }
  }
  return new Map([...[...tracked].filter(([path]) => !isContinuumIgnored(path)), ...(await untrackedDiffs(root, isContinuumIgnored, redactor))])
}
