#!/usr/bin/env node
// Builds the public website (VITE_CONTINUUM_SITE=website, as Vercel does) and
// fails if the dashboard's demo dataset, the prototype's wording or a GitHub link is in it.
//   npm run check:website
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const WEB = join(import.meta.dirname, '../apps/web')
/**
 * Strings only the dashboard's demo dataset or the prototype's labels contained,
 * and links to the source repository, which the website does not show. (The
 * hero illustration's "Startup App" is part of the landing page's design.)
 */
const FORBIDDEN = ['Developer Portfolio', 'Analytics Platform', 'Docs Site', 'Demo workspace', 'mock data', 'Mock data', 'sample data', 'Interactive demo', 'Explore the demo', 'github.com']
const REQUIRED_FILES = ['index.html', 'demo/continuum-demo.mp4', 'demo/continuum-demo.jpg']
const PREVIEW_PORT = 4787

/** Serves the built site and loads it in Chromium: it must render its headline without a single page error. */
async function renderErrors(dir) {
  const preview = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(PREVIEW_PORT), '--strictPort'], { cwd: WEB, stdio: ['ignore', 'pipe', 'inherit'] })
  const browser = await chromium.launch()
  try {
    await new Promise((resolveReady, reject) => {
      preview.stdout.on('data', (chunk) => String(chunk).includes(String(PREVIEW_PORT)) && resolveReady())
      preview.on('error', reject)
      preview.on('close', (code) => reject(new Error(`vite preview exited with ${code}`)))
    })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]))
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text().split('\n')[0]))
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'networkidle' })
    if (!(await page.getByRole('heading', { level: 1 }).isVisible())) errors.push('the landing page did not render its headline')
    return errors.map((error) => `the website fails in a browser: ${error}`)
  } finally {
    await browser.close()
    preview.kill()
  }
}

const out = mkdtempSync(join(tmpdir(), 'continuum-website-'))
try {
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: WEB, env: { ...process.env, VITE_CONTINUUM_SITE: 'website' }, stdio: ['ignore', 'ignore', 'inherit'] })
  const assets = readdirSync(join(out, 'assets')).filter((file) => file.endsWith('.js'))
  const code = assets.map((file) => readFileSync(join(out, 'assets', file), 'utf8')).join('\n') + readFileSync(join(out, 'index.html'), 'utf8')
  const failures = [
    ...FORBIDDEN.filter((text) => code.includes(text)).map((text) => `the website contains demo content: "${text}"`),
    ...REQUIRED_FILES.filter((file) => !existsSync(join(out, file))).map((file) => `the website is missing ${file}`),
    ...(await renderErrors(out)),
  ]
  for (const failure of failures) console.error(`FAIL ${failure}`)
  if (failures.length > 0) process.exit(1)
  console.log(`Website OK: ${assets.length} script(s), no demo content, renders without errors.`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
