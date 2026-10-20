import { relative, resolve } from 'node:path'
import type { Plugin } from 'vite'

/** Lists the dependencies in the built app, for the release package's third-party notices (scripts/bundle.mjs). */
export const THIRD_PARTY_FILE = 'third-party-packages.json'
const WEB_ROOT = new URL('.', import.meta.url).pathname
const REPO_ROOT = resolve(WEB_ROOT, '../..')

/**
 * The directory of the npm package a file belongs to, through the last
 * node_modules so a nested copy is its own package: `/x/node_modules/a/node_modules/@s/b/c.js` → `/x/node_modules/a/node_modules/@s/b`.
 * scripts/third-party-notices.mjs does the same for the CLI bundle.
 */
export function packageDirOf(path: string): string | null {
  const match = /^((?:.*[\\/])?node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/?]+)/.exec(path)
  return match ? match[1] : null
}

/** Writes the package directories (relative to the repository) of everything bundled into the dashboard: modules, and assets such as fonts that CSS brings in. */
export function thirdPartyPackages(): Plugin {
  return {
    name: 'continuum-third-party-packages',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.values(bundle).flatMap((output) => (output.type === 'asset' ? output.originalFileNames : []))
      const dirs = [...this.getModuleIds(), ...assets]
        .map(packageDirOf)
        .filter((dir): dir is string => dir !== null)
        // Assets' original names are relative to the app; module ids are absolute.
        .map((dir) => relative(REPO_ROOT, resolve(WEB_ROOT, dir)).replace(/\\/g, '/'))
      this.emitFile({ type: 'asset', fileName: THIRD_PARTY_FILE, source: `${JSON.stringify([...new Set(dirs)].sort(), null, 2)}\n` })
    },
  }
}
