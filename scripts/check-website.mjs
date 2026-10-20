#!/usr/bin/env node
// Builds the public website (VITE_CONTINUUM_SITE=website, as Vercel does) and
// fails if the dashboard's demo dataset or the prototype's wording is in it, or if
// any page fails to render or links to GitHub.
//   npm run check:website
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const WEB = join(import.meta.dirname, '../apps/web')
/**
 * Strings only the dashboard's demo dataset or the prototype's labels contained.
 * (The hero illustration's "Startup App" is part of the landing page's design.)
 */
const FORBIDDEN = ['Developer Portfolio', 'Analytics Platform', 'Docs Site', 'Demo workspace', 'mock data', 'Mock data', 'sample data', 'Interactive demo', 'Explore the demo']
/** Links the website must not show: it does not point to the source repository. */
const FORBIDDEN_LINK = /github\.com/
const REQUIRED_FILES = ['index.html', 'demo/continuum-demo.mp4', 'demo/continuum-demo.jpg', 'demo/continuum-demo.vtt', 'og.png', 'apple-touch-icon.png', 'robots.txt', 'sitemap.xml']
/** Every page, with the heading it must show; an unknown address must show the 404. */
const PAGES = [
  ['/', 'Your work continues.'],
  ['/docs', 'Getting started'],
  ['/docs/agents', 'Agents'],
  ['/docs/commands', 'Commands'],
  ['/docs/data', 'What gets recorded'],
  ['/privacy', 'Privacy'],
  ['/no-such-page', 'This page went missing.'],
]
const PREVIEW_PORT = 4787
const DEMO_VIDEO = 'demo/continuum-demo.mp4'
/** Phones (iOS Safari, many Android decoders) refuse a whole MP4 whose AAC audio is above this. */
const MAX_MOBILE_SAMPLE_RATE = 48_000
/** MP4 boxes that only contain other boxes, on the way to each track's media header. */
const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia'])

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
    for (const [path, heading] of PAGES) {
      await page.goto(`http://localhost:${PREVIEW_PORT}${path}`, { waitUntil: 'networkidle' })
      const h1 = page.getByRole('heading', { level: 1 })
      if (!(await h1.isVisible()) || !(await h1.innerText()).includes(heading)) errors.push(`${path} did not show "${heading}"`)
      const links = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))
      for (const href of links.filter((link) => FORBIDDEN_LINK.test(link))) errors.push(`${path} links to ${href}`)
    }
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

/** Each child box of `buffer[start, end)`: its four-letter type and where its contents lie. */
function* boxes(buffer, start, end) {
  for (let at = start; at + 8 <= end; ) {
    const size = buffer.readUInt32BE(at)
    if (size < 8 || at + size > end) return
    yield { type: buffer.toString('latin1', at + 4, at + 8), start: at + 8, end: at + size }
    at += size
  }
}

/** Sample rates of the MP4's sound tracks: each track's media timescale, which is its sample rate. */
function audioSampleRates(buffer) {
  const rates = []
  const walk = (start, end) => {
    const children = [...boxes(buffer, start, end)]
    const handler = children.find((box) => box.type === 'hdlr')
    const header = children.find((box) => box.type === 'mdhd')
    // hdlr: version/flags, pre_defined, then the handler type. mdhd: the timescale follows the dates (4 bytes each in version 0, 8 in version 1).
    if (handler && header && buffer.toString('latin1', handler.start + 8, handler.start + 12) === 'soun') {
      rates.push(buffer.readUInt32BE(header.start + (buffer[header.start] === 1 ? 20 : 12)))
    }
    for (const box of children) if (CONTAINER_BOXES.has(box.type)) walk(box.start, box.end)
  }
  walk(0, buffer.length)
  return rates
}

/** The demo video must play on phones, not only in desktop browsers. */
function videoFailures(dir) {
  const path = join(dir, DEMO_VIDEO)
  if (!existsSync(path)) return []
  const rates = audioSampleRates(readFileSync(path))
  if (rates.length === 0) return [`${DEMO_VIDEO} has no audio track the check could read`]
  return rates.filter((rate) => rate > MAX_MOBILE_SAMPLE_RATE).map((rate) => `${DEMO_VIDEO} has ${rate} Hz audio, which phones cannot play; re-encode it at ${MAX_MOBILE_SAMPLE_RATE} Hz`)
}

const out = mkdtempSync(join(tmpdir(), 'continuum-website-'))
try {
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: WEB, env: { ...process.env, VITE_CONTINUUM_SITE: 'website' }, stdio: ['ignore', 'ignore', 'inherit'] })
  const assets = readdirSync(join(out, 'assets')).filter((file) => file.endsWith('.js'))
  const code = assets.map((file) => readFileSync(join(out, 'assets', file), 'utf8')).join('\n') + readFileSync(join(out, 'index.html'), 'utf8')
  const failures = [
    ...FORBIDDEN.filter((text) => code.includes(text)).map((text) => `the website contains demo content: "${text}"`),
    ...REQUIRED_FILES.filter((file) => !existsSync(join(out, file))).map((file) => `the website is missing ${file}`),
    ...videoFailures(out),
    ...(await renderErrors(out)),
  ]
  for (const failure of failures) console.error(`FAIL ${failure}`)
  if (failures.length > 0) process.exit(1)
  console.log(`Website OK: ${assets.length} script(s), no demo content, a demo video phones can play, ${PAGES.length} pages render without errors.`)
} finally {
  rmSync(out, { recursive: true, force: true })
}
