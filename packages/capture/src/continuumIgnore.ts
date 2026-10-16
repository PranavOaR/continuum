import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import ignore from 'ignore'

/** Paths listed here (gitignore syntax) are never hashed, recorded, diffed or put in a handoff. */
export const IGNORE_FILE = '.continuumignore'

export type IgnorePredicate = (path: string) => boolean

const NOTHING_IGNORED: IgnorePredicate = () => false

/**
 * Reads the repository's .continuumignore. Unlike .gitignore it also applies
 * to tracked files: a committed `secrets.env` listed here is still never captured.
 */
export async function loadContinuumIgnore(root: string): Promise<IgnorePredicate> {
  let patterns: string
  try {
    patterns = await readFile(join(root, IGNORE_FILE), 'utf8')
  } catch {
    return NOTHING_IGNORED
  }
  const matcher = ignore().add(patterns)
  return (path) => path !== '' && matcher.ignores(path)
}
