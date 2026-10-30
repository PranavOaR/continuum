import type { ContextStore } from '@continuum/store'
import { REPOSITORY_NODE } from '@continuum/store'
import { loadContinuumIgnore } from './continuumIgnore'
import { GitCommandError, gitOutput } from './git'

/** Commits recorded per scan at most; a large pull or rebase is summarized by its newest commits. */
export const MAX_COMMITS_PER_SCAN = 20
const RECORD = '\u001e'
const FIELD = '\u001f'

export interface CommitInfo {
  hash: string
  message: string
  files: string[]
  /** When it was committed (git's committer date), which a scan may notice much later. */
  committedAt: string
}

/** The HEAD the store last recorded, or null before any commit was recorded. */
export function recordedHead(store: ContextStore): string | null {
  const head = store.graph.get(REPOSITORY_NODE)?.props.head
  return typeof head === 'string' ? head : null
}

function parseLog(output: string): CommitInfo[] {
  return output
    .split(RECORD)
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [header, ...files] = record.split('\n')
      const [hash, committed, message] = header.split(FIELD)
      return { hash, message: message ?? '', files: files.map((file) => file.trim()).filter(Boolean), committedAt: new Date(committed).toISOString() }
    })
}

/**
 * Commits reachable from `head` but not from `since`, newest first: the work
 * committed since the last scan, whether by an agent or by hand. Works across
 * rebases and branch switches, where `since` is no longer an ancestor.
 */
export async function commitsSince(root: string, head: string, since: string | null): Promise<CommitInfo[]> {
  const range = since ? [head, `^${since}`] : [head, '--max-count=1']
  const isContinuumIgnored = await loadContinuumIgnore(root)
  let output: string
  try {
    // -m --first-parent: a merge lists the files it brought into this branch instead of none.
    output = await gitOutput(root, ['-c', 'core.quotePath=false', 'log', `--max-count=${MAX_COMMITS_PER_SCAN}`, '--no-renames', '-m', '--first-parent', `--format=${RECORD}%H${FIELD}%cI${FIELD}%s`, '--name-only', ...range, '--'])
  } catch (error) {
    if (!(error instanceof GitCommandError)) throw error
    // `since` no longer exists (garbage-collected after a rebase): record just HEAD.
    return since ? commitsSince(root, head, null) : []
  }
  return parseLog(output).map((commit) => ({ ...commit, files: commit.files.filter((file) => !isContinuumIgnored(file)) }))
}
