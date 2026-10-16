import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Invocation } from '@continuum/claude-code'

/**
 * How Claude Code should run this CLI. Until Continuum is published to npm it
 * runs from this checkout through tsx, so the paths are absolute and machine-specific.
 */
export function selfInvocation(): Invocation {
  const bin = fileURLToPath(new URL('./bin.ts', import.meta.url))
  const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
  return { command: process.execPath, args: ['--import', loader, bin] }
}
