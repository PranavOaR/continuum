#!/usr/bin/env node
// Assembles the public plugin repository (github.com/PranavOaR/continuum-plugin)
// in a checkout of it: the marketplace and README from plugin-repo/, the plugin
// that `npm run plugin` generates, the release bundle its hooks run (the same
// minified file npm ships, with its third-party notices), and the license.
// No source code goes there.
//
//   npm run build && npm run bundle && npm run plugin && node scripts/sync-plugin-repo.mjs ../continuum-plugin
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const target = process.argv[2]
if (!target || !existsSync(join(resolve(target), '.git'))) {
  console.error('Usage: node scripts/sync-plugin-repo.mjs <checkout of continuum-plugin>')
  process.exit(1)
}
const RELEASE = join(ROOT, 'dist/release')
const versionOf = (file) => JSON.parse(readFileSync(file, 'utf8')).version
if (!existsSync(join(RELEASE, 'continuum.js'))) {
  console.error('dist/release is missing: run `npm run build && npm run bundle` first.')
  process.exit(1)
}
const bundled = versionOf(join(RELEASE, 'package.json'))
const plugin = versionOf(join(ROOT, 'plugin/.claude-plugin/plugin.json'))
if (bundled !== plugin) {
  console.error(`dist/release is ${bundled} but the plugin is ${plugin}: rebuild the bundle, or run \`npm run plugin\`.`)
  process.exit(1)
}
const out = resolve(target)
// Replaced as a whole, so files the plugin no longer has disappear too.
rmSync(join(out, 'plugin'), { recursive: true, force: true })
cpSync(join(ROOT, 'plugin'), join(out, 'plugin'), { recursive: true })
// The hooks run this copy with node (PLUGIN_BUNDLE in packages/claude-code/src/plugin.ts), falling back to npx without it.
mkdirSync(join(out, 'plugin/bin'))
cpSync(join(RELEASE, 'continuum.js'), join(out, 'plugin/bin/continuum.js'))
cpSync(join(RELEASE, 'THIRD_PARTY_NOTICES.md'), join(out, 'plugin/THIRD_PARTY_NOTICES.md'))
cpSync(join(ROOT, 'plugin-repo'), out, { recursive: true })
cpSync(join(ROOT, 'LICENSE'), join(out, 'LICENSE'))
console.log(`Plugin repository assembled in ${out}; review with git status, then commit and push.`)
