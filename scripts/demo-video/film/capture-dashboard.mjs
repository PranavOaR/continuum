#!/usr/bin/env node
// Screenshots of the real dashboard for the film: `continuum serve` from this
// checkout's release bundle, on the repository capture.mjs recorded, at 2x so
// punch-ins stay sharp. Writes assets/dashboard/*.png and boxes.json (where
// each element the film points at sits, in screenshot pixels).
//
//   npm run build && npm run bundle
//   node scripts/demo-video/film/capture-dashboard.mjs --work <capture.mjs work dir>
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const ROOT = join(import.meta.dirname, '../../..')
const OUT = join(import.meta.dirname, 'assets/dashboard')
const args = process.argv.slice(2)
const work = resolve(args[args.indexOf('--work') + 1] ?? 'demo-video-work')
const repo = join(work, 'pricing')
const VIEWPORT = { width: 1440, height: 900 }
const SCALE = 2
const SERVE_TIMEOUT_MS = 20_000

function serve() {
  const env = { ...process.env, CONTINUUM_CONFIG_DIR: join(work, 'config') }
  const server = spawn(process.execPath, [join(ROOT, 'dist/release/continuum.js'), 'serve', '--port', '0', repo], { cwd: repo, env, stdio: ['ignore', 'pipe', 'inherit'] })
  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('continuum serve printed no link')), SERVE_TIMEOUT_MS)
    server.stdout.on('data', (chunk) => {
      const link = /Continuum dashboard: (\S+)/.exec(String(chunk))?.[1]
      if (!link) return
      clearTimeout(timer)
      done({ link, stop: () => server.kill('SIGINT') })
    })
    server.on('error', fail)
  })
}

/** Page-pixel boxes (at SCALE) of the elements the film's camera moves to, found by their text. */
function boxesOf(page, labels) {
  return page.evaluate(({ labels, scale }) => {
    const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    const result = {}
    for (const [key, text] of Object.entries(labels)) {
      const hit = [...document.querySelectorAll('body *')].find((el) => own(el) === text && el.getBoundingClientRect().height > 0)
      if (!hit) continue
      const box = (hit.closest('section, article') ?? hit).getBoundingClientRect()
      const self = hit.getBoundingClientRect()
      const px = (r) => ({ x: Math.round((r.left + window.scrollX) * scale), y: Math.round((r.top + window.scrollY) * scale), w: Math.round(r.width * scale), h: Math.round(r.height * scale) })
      result[key] = { text: px(self), section: px(box) }
    }
    return result
  }, { labels, scale: SCALE })
}

mkdirSync(OUT, { recursive: true })
const { link, stop } = await serve()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(link)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: join(OUT, 'overview.png'), fullPage: true })
  const boxes = { overview: await boxesOf(page, { projects: 'pricing' }) }

  await page.getByRole('link', { name: /pricing/i }).first().click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, 'workspace.png'), fullPage: true })
  boxes.workspace = await boxesOf(page, {
    task: 'Fix pricing.js bugs',
    verification: 'Verification',
    verified: 'Verified',
    files: 'File changes',
    activity: 'Agent activity',
    criteria: 'Acceptance criteria',
  })
  boxes.workspace.size = await page.evaluate((scale) => ({ w: document.documentElement.scrollWidth * scale, h: document.documentElement.scrollHeight * scale }), SCALE)
  writeFileSync(join(OUT, 'boxes.json'), `${JSON.stringify(boxes, null, 2)}\n`)
  console.log(`Saved ${OUT}`)
} finally {
  await browser.close()
  stop()
}
