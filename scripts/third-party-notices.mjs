// The license texts of the open-source packages bundled into the release:
// distributing their code requires carrying their notices, whatever
// Continuum's own license is.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Workspace packages are Continuum's own, under its license. */
const OWN_SCOPE = '@continuum/'
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-][\w.-]+)?$/i

/**
 * The directory of the npm package a bundled file belongs to, through the last
 * node_modules so a nested copy is its own package. The dashboard's Vite plugin
 * (apps/web/thirdPartyPackages.ts) does the same.
 */
export function packageDirOf(path) {
  const match = /^((?:.*[\\/])?node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/?]+)/.exec(path)
  return match ? match[1].replace(/\\/g, '/') : null
}

/** Name, version, license and license texts of the package in `dir` (relative to `root`). */
function describe(root, dir) {
  const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
  const license = typeof manifest.license === 'string' ? manifest.license : (manifest.license?.type ?? 'unknown')
  const texts = readdirSync(join(root, dir))
    .filter((file) => LICENSE_FILE.test(file))
    .sort()
    .map((file) => readFileSync(join(root, dir, file), 'utf8').trim())
  return { name: manifest.name, version: manifest.version, license, texts }
}

/**
 * THIRD_PARTY_NOTICES.md for the given package directories (relative to
 * `root`). Fails when a package has no license text to reproduce (most
 * licenses require the text itself), so nothing ships unattributed.
 */
export function thirdPartyNotices(root, dirs) {
  // One entry per name and version: the CLI and the dashboard can bundle the same package from different paths.
  const byVersion = new Map([...new Set(dirs)].map((dir) => describe(root, dir)).map((entry) => [`${entry.name}@${entry.version}`, entry]))
  const packages = [...byVersion.values()].filter((entry) => !entry.name.startsWith(OWN_SCOPE)).sort((a, b) => a.name.localeCompare(b.name))
  const missing = packages.filter((entry) => entry.texts.length === 0)
  if (missing.length > 0) throw new Error(`No license text found for: ${missing.map((entry) => `${entry.name} (${entry.license})`).join(', ')}`)
  const sections = packages.map(({ name, version, license, texts }) =>
    [`## ${name} ${version}`, '', `License: ${license}`, ...texts.map((text) => ['', '```', text, '```'].join('\n'))].join('\n'),
  )
  return [
    '# Third-party notices',
    '',
    'Continuum includes the following open-source packages. Each is licensed under its own terms, reproduced here; Continuum’s license (LICENSE) does not change them.',
    '',
    ...sections.join('\n\n').split('\n'),
    '',
  ].join('\n')
}
