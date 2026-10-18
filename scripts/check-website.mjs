#!/usr/bin/env node
// Builds the public website (VITE_CONTINUUM_SITE=website, as Vercel does) and
// fails if the dashboard's demo dataset or the old prototype's wording is in it.
//   npm run check:website
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const WEB = join(import.meta.dirname, '../apps/web')
/** Strings only the demo dataset or the prototype landing page contained. */
const FORBIDDEN = ['Startup App', 'Developer Portfolio', 'Analytics Platform', 'mock data', 'Mock data', 'Explore the demo', 'ChatGPT']
const REQUIRED_FILES = ['index.html', 'demo/continuum-demo.mp4', 'demo/continuum-demo.jpg']

const out = mkdtempSync(join(tmpdir(), 'continuum-website-'))
try {
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: WEB, env: { ...process.env, VITE_CONTINUUM_SITE: 'website' }, stdio: ['ignore', 'ignore', 'inherit'] })
  const assets = readdirSync(join(out, 'assets')).filter((file) => file.endsWith('.js'))
  const code = assets.map((file) => readFileSync(join(out, 'assets', file), 'utf8')).join('\n') + readFileSync(join(out, 'index.html'), 'utf8')
  const failures = [
    ...FORBIDDEN.filter((text) => code.includes(text)).map((text) => `the website contains demo content: "${text}"`),
    ...REQUIRED_FILES.filter((file) => !existsSync(join(out, file))).map((file) => `the website is missing ${file}`),
  ]
  for (const failure of failures) console.error(`FAIL ${failure}`)
  if (failures.length > 0) process.exit(1)
  console.log(`Website OK: ${assets.length} script(s), no demo content.`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
