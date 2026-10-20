#!/usr/bin/env node
// Assembles the public plugin repository (github.com/PranavOaR/continuum-plugin)
// in a checkout of it: the marketplace and README from plugin-repo/, the plugin
// that `npm run plugin` generates, and the license. No source code goes there.
//
//   npm run plugin && node scripts/sync-plugin-repo.mjs ../continuum-plugin
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const target = process.argv[2]
if (!target || !existsSync(join(resolve(target), '.git'))) {
  console.error('Usage: node scripts/sync-plugin-repo.mjs <checkout of continuum-plugin>')
  process.exit(1)
}
const out = resolve(target)
// Replaced as a whole, so files the plugin no longer has disappear too.
rmSync(join(out, 'plugin'), { recursive: true, force: true })
cpSync(join(ROOT, 'plugin'), join(out, 'plugin'), { recursive: true })
cpSync(join(ROOT, 'plugin-repo'), out, { recursive: true })
cpSync(join(ROOT, 'LICENSE'), join(out, 'LICENSE'))
console.log(`Plugin repository assembled in ${out}; review with git status, then commit and push.`)
