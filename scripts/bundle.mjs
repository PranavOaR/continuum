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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'dist/release')
const WEB_DIST = join(ROOT, 'apps/web/dist')
const CLI = JSON.parse(readFileSync(join(ROOT, 'packages/cli/package.json'), 'utf8'))
/** The published name; CONTINUUM_PACKAGE_NAME overrides it for test builds. */
const DEFAULT_NAME = '@pranavoar/continuum'
/** node:sqlite runs without a flag from 22.13. */
const MIN_NODE = '>=22.13'

const packageName = process.env.CONTINUUM_PACKAGE_NAME ?? DEFAULT_NAME
const version = process.env.CONTINUUM_VERSION ?? CLI.version

if (!existsSync(join(WEB_DIST, 'index.html'))) {
  console.error('apps/web/dist is missing: run `npm run build` first.')
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

await build({
  entryPoints: [join(ROOT, 'packages/cli/src/bin.ts')],
  outfile: join(OUT, 'continuum.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: 'eof',
  // Bundled CommonJS dependencies call require(); give them one in ESM.
  banner: { js: "import { createRequire as __continuumRequire } from 'node:module'; const require = __continuumRequire(import.meta.url);" },
  define: { __CONTINUUM_BUILD__: JSON.stringify({ version, packageName }) },
  logLevel: 'warning',
})

// The website's demo video stays out of the package: the dashboard does not use it.
const DEMO_DIR = join(WEB_DIST, 'demo')
cpSync(WEB_DIST, join(OUT, 'web'), { recursive: true, filter: (source) => source !== DEMO_DIR && !source.startsWith(DEMO_DIR + sep) })
cpSync(join(ROOT, 'README.md'), join(OUT, 'README.md'))
if (existsSync(join(ROOT, 'LICENSE'))) cpSync(join(ROOT, 'LICENSE'), join(OUT, 'LICENSE'))

const manifest = {
  name: packageName,
  version,
  description: 'Keep AI coding work continuous across sessions and agents. Local-first: nothing leaves your machine.',
  type: 'module',
  // npm rewrites './continuum.js' at publish (and warns that it removed it), so write its normal form.
  bin: { continuum: 'continuum.js' },
  files: ['continuum.js', 'web', 'README.md', 'LICENSE'],
  engines: { node: MIN_NODE },
  license: 'MIT',
  author: 'Pranav Rao',
  homepage: 'https://github.com/PranavOaR/continuum#readme',
  bugs: { url: 'https://github.com/PranavOaR/continuum/issues' },
  keywords: ['claude-code', 'codex', 'cursor', 'mcp', 'ai-agents', 'handoff', 'context', 'local-first'],
  repository: { type: 'git', url: 'git+https://github.com/PranavOaR/continuum.git' },
}
writeFileSync(join(OUT, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const kib = (path) => Math.round(statSync(path).size / 1024)
console.log(`Bundled ${packageName}@${version} into ${OUT} (continuum.js ${kib(join(OUT, 'continuum.js'))} KiB)`)
