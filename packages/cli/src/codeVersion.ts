import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILD_INFO } from './build'

const HERE = dirname(fileURLToPath(import.meta.url))

function stamp(path: string): string {
  try {
    const info = statSync(path)
    return `${info.size}:${info.mtimeMs}`
  } catch {
    return 'missing'
  }
}

/** Every source file under a checkout's packages, so a `git pull` is noticed. */
function sourceFiles(root: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts')) files.push(path)
    }
  }
  for (const pkg of readdirSync(join(root, 'packages'))) {
    try {
      walk(join(root, 'packages', pkg, 'src'))
    } catch {
      // not a package with sources
    }
  }
  return files
}

/**
 * Changes whenever the code `continuum serve` runs from changes: the release
 * bundle and its dashboard, or a checkout's sources and built dashboard.
 */
export function codeFingerprint(): string {
  if (BUILD_INFO) return [fileURLToPath(import.meta.url), join(HERE, 'web', 'index.html')].map(stamp).join('|')
  const root = join(HERE, '../../..')
  return [...sourceFiles(root), join(root, 'apps/web/dist/index.html')].map(stamp).join('|')
}
