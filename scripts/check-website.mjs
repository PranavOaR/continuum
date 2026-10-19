#!/usr/bin/env node
// Builds the public website (VITE_CONTINUUM_SITE=website, as Vercel does) and
// fails if the dashboard's demo dataset, the prototype's wording or a GitHub link is in it.
//   npm run check:website
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const WEB = join(import.meta.dirname, '../apps/web')
/**
 * Strings only the dashboard's demo dataset or the prototype's labels contained,
 * and links to the source repository, which the website does not show. (The
 * hero illustration's "Startup App" is part of the landing page's design.)
 */
const FORBIDDEN = ['Developer Portfolio', 'Analytics Platform', 'Docs Site', 'Demo workspace', 'mock data', 'Mock data', 'sample data', 'Interactive demo', 'Explore the demo', 'github.com']
const REQUIRED_FILES = ['index.html', 'demo/continuum-demo.mp4', 'demo/continuum-demo.jpg']
const PREVIEW_PORT = 4787

/** How long vite preview may take to start. */
const PREVIEW_START_MS = 30_000

/** Serves the built site and loads it in Chromium: it must render its headline without a single page error. */
async function renderErrors(dir) {
  // Its own process group, so stopping it stops vite and not only the npx wrapper.
  const preview = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(PREVIEW_PORT), '--strictPort'], { cwd: WEB, detached: true, stdio: ['ignore', 'pipe', 'inherit'] })
  // Listening from the start, so an early exit is never missed.
  const ready = new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`vite preview did not start within ${PREVIEW_START_MS / 1000}s`)), PREVIEW_START_MS)
    preview.stdout.on('data', (chunk) => String(chunk).includes(String(PREVIEW_PORT)) && (clearTimeout(timer), resolveReady()))
    preview.on('error', (error) => (clearTimeout(timer), reject(error)))
    preview.on('close', (code) => (clearTimeout(timer), reject(new Error(`vite preview exited with ${code}`))))
  })
  let browser
  try {
    await ready
    browser = await chromium.launch()
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message.split('\n')[0]))
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text().split('\n')[0]))
    await page.goto(`http://localhost:${PREVIEW_PORT}/`, { waitUntil: 'networkidle' })
    if (!(await page.getByRole('heading', { level: 1 }).isVisible())) errors.push('the landing page did not render its headline')
    return errors.map((error) => `the website fails in a browser: ${error}`)
  } finally {
    await browser?.close()
    try {
      process.kill(-preview.pid, 'SIGTERM')
    } catch {
      // Already stopped.
    }
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
