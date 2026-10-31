import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ignore from 'ignore'

/** Paths listed here (gitignore syntax) are never hashed, recorded, diffed or put in a handoff. */
export const IGNORE_FILE = '.continuumignore'

export type IgnorePredicate = (path: string) => boolean

const NOTHING_IGNORED: IgnorePredicate = () => false

/** The file exists but cannot be read: capturing anyway could store exactly what it lists. */
export class UnreadableIgnoreFileError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Cannot read ${path} (${cause instanceof Error ? cause.message : String(cause)}). Continuum records nothing in this repository until it can.`)
    this.name = 'UnreadableIgnoreFileError'
  }
}

/**
 * Reads the repository's .continuumignore. Unlike .gitignore it also applies
 * to tracked files: a committed `secrets.env` listed here is still never captured.
 */
export async function loadContinuumIgnore(root: string): Promise<IgnorePredicate> {
  const path = join(root, IGNORE_FILE)
  let patterns: string
  try {
    patterns = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return NOTHING_IGNORED
    throw new UnreadableIgnoreFileError(path, error)
  }
  const matcher = ignore().add(patterns)
  return (path) => path !== '' && matcher.ignores(path)
}
