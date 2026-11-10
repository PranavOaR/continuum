import type { ContentHash, IdentityKey } from '@continuum/core'
import { anchoredPath, normalizePath } from '@continuum/store'
import { GitCommandError, gitOutput } from './git'
import { symbolHashesFrom } from './symbolHashes'

/** What `git commit` would record now, for the paths it changes. */
export interface StagedChanges {
  /** Repository paths added, modified or deleted in the index, against HEAD. */
  paths: string[]
  /** Staged blob hash of each of those paths still in the index; a deleted path has none. */
  files: Map<string, ContentHash>
  /**
   * Hashes, in the staged source, of the symbols asked for in those paths; one
   * that is gone has none. A symbol has two when the staged file has LF line
   * endings: a checkout that converts them (Windows, core.autocrlf) anchored
   * the same code with CRLF, and it has not changed.
   */
  symbols: Map<IdentityKey, ContentHash[]>
}

const split = (output: string) => output.split('\0').filter(Boolean).map(normalizePath)

/** The staged content of a path, or null when git cannot show it (a submodule, say). */
async function stagedSource(root: string, path: string): Promise<string | null> {
  try {
    return await gitOutput(root, ['show', `:${path}`])
  } catch (error) {
    if (error instanceof GitCommandError) return null
    throw error
  }
}

/**
 * Reads the staged changes: which paths differ from HEAD, the staged hash of
 * each, and the staged hash of each symbol in `symbolKeys` that lives in one
 * of them. Renames count as a deletion and an addition, so a moved file's
 * anchors read as changed.
 */
export async function readStaged(root: string, symbolKeys: readonly IdentityKey[]): Promise<StagedChanges> {
  const paths = split(await gitOutput(root, ['diff', '--cached', '--name-only', '--no-renames', '-z']))
  if (paths.length === 0) return { paths, files: new Map(), symbols: new Map() }
  const staged = new Set(paths)
  const files = new Map<string, ContentHash>()
  for (const record of (await gitOutput(root, ['ls-files', '-z', '--stage', '--', ...paths])).split('\0')) {
    const match = /^\d{6} ([0-9a-f]+) 0\t(.+)$/s.exec(record)
    if (match) files.set(normalizePath(match[2]), match[1])
  }
  const wanted = symbolKeys.filter((key) => staged.has(anchoredPath(key) ?? ''))
  const sources = new Map<string, string | null>()
  for (const path of new Set(wanted.map((key) => anchoredPath(key) as string))) sources.set(path, files.has(path) ? await stagedSource(root, path) : null)
  const asStaged = await symbolHashesFrom(wanted, async (path) => sources.get(path) ?? null)
  const withCrlf = await symbolHashesFrom(wanted, async (path) => {
    const source = sources.get(path) ?? null
    return source === null || source.includes('\r') ? null : source.replaceAll('\n', '\r\n')
  })
  const symbols = new Map([...asStaged].map(([key, hash]) => [key, [hash, ...(withCrlf.has(key) ? [withCrlf.get(key) as ContentHash] : [])]]))
  return { paths, files, symbols }
}
