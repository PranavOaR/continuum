import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Invocation } from '@continuum/claude-code'
import { BUILD_INFO, type BuildInfo } from './build'

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

const isInstalledPackage = (file: string) => file.includes(`${sep}node_modules${sep}`)

/**
 * How Claude Code should run this CLI.
 * - Installed from npm (npx, global or local install): `npx -y <package>@<version>`,
 *   which works on any machine, so the configuration can be shared.
 * - A bundle outside node_modules (a local build): `node <bundle>`.
 * - A checkout: `node --import tsx …/bin.ts`.
 * The last two hold absolute, machine-specific paths.
 */
export function selfInvocation(build: BuildInfo | null = BUILD_INFO, entry: string = fileURLToPath(import.meta.url)): Invocation {
  const node = stableNodePath(process.execPath, process.env.PATH)
  if (build && isInstalledPackage(entry)) return { command: 'npx', args: ['-y', `${build.packageName}@${build.version}`], portable: true }
  if (build) return { command: node, args: [entry], portable: false }
  const bin = fileURLToPath(new URL('./bin.ts', import.meta.url))
  const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
  return { command: node, args: ['--import', loader, bin], portable: false }
}
