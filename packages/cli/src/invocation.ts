import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Invocation } from '@continuum/claude-code'

function realpath(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/**
 * Prefers a `node` on PATH that resolves to the running binary, so hooks keep
 * working after upgrades move versioned install paths (e.g. Homebrew's Cellar).
 */
export function stableNodePath(execPath: string, pathEnv: string | undefined): string {
  const target = realpath(execPath)
  for (const dir of (pathEnv ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(dir, 'node')
    if (candidate !== execPath && target !== null && realpath(candidate) === target) return candidate
  }
  return execPath
}

/**
 * How Claude Code should run this CLI. Until Continuum is published to npm it
 * runs from this checkout through tsx, so the paths are absolute and machine-specific.
 */
export function selfInvocation(): Invocation {
  const bin = fileURLToPath(new URL('./bin.ts', import.meta.url))
  const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
  return { command: stableNodePath(process.execPath, process.env.PATH), args: ['--import', loader, bin] }
}
