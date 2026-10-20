#!/usr/bin/env node
// Builds the publishable package in dist/release: one self-contained ESM file
// (no tsx or workspace packages at runtime) plus the built dashboard.
//
//   npm run build && npm run bundle
//
// CONTINUUM_PACKAGE_NAME sets the npm name stamped into the bundle; setup
// writes `npx -y <name>@<version>` into Claude Code's configuration.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { packageDirOf, thirdPartyNotices } from './third-party-notices.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'dist/release')
const WEB_DIST = join(ROOT, 'apps/web/dist')
const CLI = JSON.parse(readFileSync(join(ROOT, 'packages/cli/package.json'), 'utf8'))
/** The published name; CONTINUUM_PACKAGE_NAME overrides it for test builds. */
const DEFAULT_NAME = 'getcontinuum'
/** node:sqlite runs without a flag from 22.13. */
const MIN_NODE = '>=22.13'
/** Written by the dashboard build (apps/web/thirdPartyPackages.ts): the packages it bundles. */
const WEB_PACKAGES = 'third-party-packages.json'
/** The public plugin repository hosts help and bug reports while the source is private. */
const SUPPORT_REPO = 'https://github.com/PranavOaR/continuum-plugin'

const packageName = process.env.CONTINUUM_PACKAGE_NAME ?? DEFAULT_NAME
const version = process.env.CONTINUUM_VERSION ?? CLI.version

if (!existsSync(join(WEB_DIST, 'index.html'))) {
  console.error('apps/web/dist is missing: run `npm run build` first.')
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const { metafile } = await build({
  entryPoints: [join(ROOT, 'packages/cli/src/bin.ts')],
  outfile: join(OUT, 'continuum.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Fully minified, with no source map: Continuum is proprietary. Third-party license comments are kept.
  minify: true,
  legalComments: 'eof',
  metafile: true,
  // Bundled CommonJS dependencies call require(); give them one in ESM.
  banner: { js: "import { createRequire as __continuumRequire } from 'node:module'; const require = __continuumRequire(import.meta.url);" },
  define: { __CONTINUUM_BUILD__: JSON.stringify({ version, packageName }) },
  logLevel: 'warning',
})

// The website's demo video stays out of the package: the dashboard does not use it.
// The package list is for the notices below, not for the dashboard.
const DEMO_DIR = join(WEB_DIST, 'demo')
const leftOut = new Set([DEMO_DIR, join(WEB_DIST, WEB_PACKAGES)])
cpSync(WEB_DIST, join(OUT, 'web'), { recursive: true, filter: (source) => !leftOut.has(source) && !source.startsWith(DEMO_DIR + sep) })
// The repository README is for developing Continuum; npm shows users their own.
cpSync(join(ROOT, 'scripts/release/README.md'), join(OUT, 'README.md'))
cpSync(join(ROOT, 'CHANGELOG.md'), join(OUT, 'CHANGELOG.md'))
cpSync(join(ROOT, 'LICENSE'), join(OUT, 'LICENSE'))

// esbuild lists inputs relative to the working directory, the repository root under `npm run bundle`.
const cliPackages = Object.keys(metafile.inputs).map(packageDirOf).filter((dir) => dir !== null)
const webPackages = JSON.parse(readFileSync(join(WEB_DIST, WEB_PACKAGES), 'utf8'))
writeFileSync(join(OUT, 'THIRD_PARTY_NOTICES.md'), thirdPartyNotices(ROOT, [...cliPackages, ...webPackages]))

const manifest = {
  name: packageName,
  version,
  description: 'Keep AI coding work continuous across sessions and agents. Local-first: nothing leaves your machine.',
  type: 'module',
  // npm rewrites './continuum.js' at publish (and warns that it removed it), so write its normal form.
  bin: { continuum: 'continuum.js' },
  files: ['continuum.js', 'web', 'README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'],
  engines: { node: MIN_NODE },
  license: 'SEE LICENSE IN LICENSE',
  author: 'Pranav Rao',
  homepage: 'https://continuumgroup.dev',
  bugs: { url: `${SUPPORT_REPO}/issues` },
  keywords: ['claude-code', 'codex', 'cursor', 'vscode', 'github-copilot', 'mcp', 'ai-agents', 'handoff', 'context', 'local-first'],
}
writeFileSync(join(OUT, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const kib = (path) => Math.round(statSync(path).size / 1024)
console.log(`Bundled ${packageName}@${version} into ${OUT} (continuum.js ${kib(join(OUT, 'continuum.js'))} KiB)`)
