import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, join } from 'node:path'
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
export function stableNodePath(execPath: string, pathEnv: string | undefined, platform: NodeJS.Platform = process.platform): string {
  const target = realpath(execPath)
  const name = platform === 'win32' ? 'node.exe' : 'node'
  for (const dir of (pathEnv ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(dir, name)
    if (candidate !== execPath && target !== null && realpath(candidate) === target) return candidate
  }
  return execPath
}

const isInstalledPackage = (file: string) => /[\\/]node_modules[\\/]/.test(file)

/**
 * How Claude Code should run this CLI.
 * - Installed from npm (npx, global or local install): `npx -y <package>@<version>`,
 *   which works on any machine, so the configuration can be shared. On Windows npx
 *   is a .cmd shim that agents cannot start without a shell, so it runs through
 *   `cmd /c`, which works only on Windows: that configuration is not shared.
 * - A bundle outside node_modules (a local build): `node <bundle>`.
 * - A checkout: `node --import tsx …/bin.ts`.
 * The last two hold absolute, machine-specific paths.
 */
export function selfInvocation(build: BuildInfo | null = BUILD_INFO, entry: string = fileURLToPath(import.meta.url), platform: NodeJS.Platform = process.platform): Invocation {
  const node = stableNodePath(process.execPath, process.env.PATH, platform)
  if (build && isInstalledPackage(entry)) {
    const npx = ['npx', '-y', `${build.packageName}@${build.version}`]
    return platform === 'win32' ? { command: 'cmd', args: ['/c', ...npx], portable: false } : { command: npx[0], args: npx.slice(1), portable: true }
  }
  if (build) return { command: node, args: [entry], portable: false }
  const bin = fileURLToPath(new URL('./bin.ts', import.meta.url))
  const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
  return { command: node, args: ['--import', loader, bin], portable: false }
}
