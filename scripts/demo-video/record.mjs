#!/usr/bin/env node
// Step 2 of the demo video: renders it, frame by frame, from capture.mjs's
// real run: terminal scenes replay the captured output, and the dashboard
// scene is the real `continuum serve` for that repository.
//
//   node scripts/demo-video/record.mjs --work <dir> [--out apps/web/public/demo]
//
// Needs ffmpeg and Playwright's Chromium.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(import.meta.dirname, '../..')
const args = process.argv.slice(2)
/** The value after `name`; a missing value (the end, or another --flag) is an error, not a path. */
const option = (name) => {
  if (!args.includes(name)) return undefined
  const value = args[args.indexOf(name) + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}
const work = resolve(option('--work') ?? 'demo-video-work')
const out = resolve(option('--out') ?? join(ROOT, 'apps/web/public/demo'))
const capture = JSON.parse(readFileSync(join(work, 'capture.json'), 'utf8'))
const repo = join(work, 'pricing')

const FPS = 30
const FRAME_MS = 1000 / FPS
const VIEWPORT = { width: 1280, height: 720 }
// 1280×720 laid out, captured at 1920×1080.
const SCALE = 1.5
const CWD = '~/continuum-demo/pricing'

const output = (name) => capture.steps.find((step) => step.name === name)?.output ?? ''
const firstLines = (text, count) => text.split('\n').slice(0, count).join('\n')
const handoffBody = (text) => text.split('\n').filter((line) => !line.startsWith('Generated ') && !line.startsWith('Evidence labels')).join('\n')

const SCENES = [
  { kind: 'card', logo: true, subtitle: 'Claude Code starts a task. Codex finishes it. Nothing is lost in between.', duration: 3200 },
  {
    kind: 'term', step: '01', caption: 'Connect both agents to the repository', title: 'zsh — pricing', cwd: CWD, hold: 1600,
    steps: [
      { kind: 'cmd', text: 'npx @pranavoar/continuum setup claude-code' }, { kind: 'out', text: firstLines(output('setup-claude'), 3) },
      { kind: 'cmd', text: 'npx @pranavoar/continuum setup codex' }, { kind: 'out', text: firstLines(output('setup-codex'), 3) },
    ],
  },
  {
    kind: 'term', step: '02', caption: 'Claude Code fixes one of the two bugs, records the task, and stops', title: 'claude — pricing', cwd: CWD, hold: 3200,
    steps: [{ kind: 'cmd', text: `claude -p "${capture.prompts.claude}"` }, { kind: 'out', text: `\n${output('claude')}` }],
  },
  {
    kind: 'term', step: '03', caption: 'When Codex starts, Continuum briefs it with this', title: 'zsh — pricing', cwd: CWD, hold: 5200, small: true,
    steps: [{ kind: 'cmd', text: 'npx @pranavoar/continuum handoff' }, { kind: 'out', text: handoffBody(output('handoff-before-codex')) }],
  },
  {
    kind: 'term', step: '04', caption: 'Codex picks up the same task and finishes it; you verify the result', title: 'codex — pricing', cwd: CWD, hold: 2400,
    steps: [
      { kind: 'cmd', text: `codex exec "${capture.prompts.codex}"` }, { kind: 'out', text: `\n${output('codex')}\n` },
      { kind: 'cmd', text: 'npx @pranavoar/continuum run -- npm test' }, { kind: 'out', text: output('verified-run') },
    ],
  },
  { kind: 'dashboard' },
  { kind: 'card', logo: true, code: 'npx @pranavoar/continuum setup claude-code', url: 'continuumgroup.dev', duration: 4200 },
]

function startFfmpeg(path) {
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((resolveDone, reject) => {
    ffmpeg.on('error', (error) => reject(new Error(`could not run ffmpeg: ${error.message}`)))
    ffmpeg.on('close', (code) => (code === 0 ? resolveDone() : reject(new Error(`ffmpeg exited with ${code}`))))
  })
  // A write to an ffmpeg that died fails with EPIPE; `done` reports why it died.
  ffmpeg.stdin.on('error', () => {})
  return {
    // Races `done`, so a dead ffmpeg ends the render instead of waiting forever for 'drain'.
    write: (frame) => Promise.race([new Promise((resolveWrite) => (ffmpeg.stdin.write(frame) ? resolveWrite() : ffmpeg.stdin.once('drain', resolveWrite))), done]),
    close: () => (ffmpeg.stdin.end(), done),
    kill: () => ffmpeg.kill('SIGKILL'),
  }
}

/** A port nothing is listening on. */
const freePort = () =>
  new Promise((resolvePort, reject) => {
    const probe = createServer().once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolvePort(port))
    })
  })

async function startDashboard() {
  const env = { ...process.env, CONTINUUM_CONFIG_DIR: join(work, 'config'), npm_config_update_notifier: 'false' }
  // Its own process group, so stopping it also stops the node process npx starts.
  const server = spawn('npx', ['-y', capture.package, 'serve', '--port', String(await freePort()), repo], { cwd: repo, env, detached: true, stdio: ['ignore', 'pipe', 'inherit'] })
  const stop = () => {
    try {
      process.kill(-server.pid, 'SIGINT')
    } catch {
      // Already stopped.
    }
  }
  const url = await new Promise((resolveUrl, reject) => {
    let text = ''
    server.stdout.on('data', (chunk) => {
      text += chunk
      const match = /dashboard: (http\S+)/.exec(text)
      if (match) resolveUrl(match[1])
    })
    server.on('error', (error) => reject(new Error(`could not start continuum serve: ${error.message}`)))
    server.on('close', () => reject(new Error(`continuum serve stopped: ${text}`)))
  }).catch((error) => {
    stop()
    throw error
  })
  return { url, stop }
}

async function recordScenes(page, video, scenes) {
  await page.goto(pathToFileURL(join(import.meta.dirname, 'scenes.html')).href)
  await page.evaluate(() => document.fonts.ready)
  for (const scene of scenes) {
    const length = await page.evaluate((s) => window.sceneLength(s), scene)
    console.log(`  scene ${scene.step ?? scene.kind}: ${(length / 1000).toFixed(1)}s`)
    for (let t = 0; t < length; t += FRAME_MS) {
      await page.evaluate(([s, time]) => window.renderScene(s, time), [scene, t])
      await video.write(await page.screenshot())
    }
  }
}

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const mix = (a, b, x) => a + (b - a) * x

/** Where the dashboard's key elements sit on the page, found by their text. */
async function anchors(page) {
  return page.evaluate(() => {
    const find = (text, { exact = true, minFont = 0, within = document.body } = {}) => {
      const all = [...within.querySelectorAll('*')].filter((el) => el.children.length === 0 || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      const hit = all.find((el) => {
        const own = el.textContent.trim()
        return (exact ? own === text : own.includes(text)) && parseFloat(getComputedStyle(el).fontSize) >= minFont && el.getBoundingClientRect().height > 0
      })
      if (!hit) throw new Error(`dashboard element not found: ${text}`)
      const box = hit.getBoundingClientRect()
      return { x: box.left + Math.min(box.width, 220) / 2, y: box.top + window.scrollY + box.height / 2, el: hit }
    }
    const section = (heading) => find(heading).el.closest('section, article, [class*="rounded"]') ?? document.body
    const at = ({ x, y }) => ({ x, y })
    return {
      task: at(find('Fix pricing.js bugs', { minFont: 18 })),
      verified: at(find('Verified', { within: section('Verification') })),
      criteria: at(find('Acceptance criteria')),
      file: at(find('src/pricing.js', { within: section('File changes') })),
      activity: at(find('Agent activity')),
      codex: at(find('Codex session started')),
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
    }
  })
}

const OVERLAY = `
  const layer = document.createElement('div')
  layer.innerHTML = '<div id="demo-fade" style="position:fixed;inset:0;background:#fafaf7;z-index:99998;pointer-events:none"></div>' +
    '<div id="demo-caption" style="position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;pointer-events:none;background:#141318;color:#fafaf7;font:500 17px Geist,system-ui,sans-serif;letter-spacing:-0.01em;padding:12px 20px;border-radius:999px;box-shadow:0 10px 30px -10px rgb(0 0 0/.5);white-space:nowrap"></div>' +
    '<svg id="demo-cursor" width="26" height="26" viewBox="0 0 24 24" style="position:fixed;left:0;top:0;z-index:99999;pointer-events:none;filter:drop-shadow(0 2px 3px rgb(0 0 0/.3))"><path d="M4 2l15 10.5-6.6 1.2 3.9 7.3-3 1.6-3.9-7.4L4 20z" fill="#141318" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  document.body.append(layer)
  window.demoFrame = ({ scrollY, x, y, caption, fade }) => {
    window.scrollTo(0, scrollY)
    document.getElementById('demo-cursor').style.transform = 'translate(' + x + 'px,' + y + 'px)'
    const pill = document.getElementById('demo-caption')
    pill.textContent = caption
    pill.style.opacity = caption ? '1' : '0'
    document.getElementById('demo-fade').style.opacity = String(fade)
  }`

/** The dashboard tour: keyframes of scroll position, cursor position (page coordinates) and caption. */
function tour(a) {
  const top = (y, offset) => Math.max(0, Math.min(a.maxScroll, y - offset))
  return [
    { t: 0, scroll: 0, at: { x: 980, y: 420 }, caption: '' },
    { t: 700, scroll: 0, at: { x: 980, y: 420 }, caption: 'One task, carried from Claude Code to Codex' },
    { t: 2400, scroll: 0, at: a.task, caption: 'One task, carried from Claude Code to Codex' },
    { t: 3400, scroll: 0, at: a.task, caption: 'Verified: Continuum ran npm test against the exact file contents' },
    { t: 5000, scroll: 0, at: a.verified, caption: 'Verified: Continuum ran npm test against the exact file contents' },
    { t: 6400, scroll: 0, at: a.verified, caption: 'The acceptance criteria and steps, as the agents reported them' },
    { t: 8600, scroll: top(a.criteria.y, 130), at: { x: a.criteria.x + 120, y: a.criteria.y + 60 }, caption: 'The acceptance criteria and steps, as the agents reported them' },
    { t: 9800, scroll: top(a.criteria.y, 130), at: { x: a.criteria.x + 120, y: a.criteria.y + 60 }, caption: 'The change itself, covered by the passing check' },
    { t: 12000, scroll: top(a.file.y, 260), at: a.file, caption: 'The change itself, covered by the passing check' },
    { t: 13200, scroll: top(a.file.y, 260), at: a.file, caption: 'Every event in order: Claude Code’s session, then Codex’s' },
    { t: 15600, scroll: top(a.activity.y, 90), at: { x: a.activity.x, y: a.activity.y + 90 }, caption: 'Every event in order: Claude Code’s session, then Codex’s' },
    { t: 19600, scroll: top(a.codex.y, 360), at: a.codex, caption: 'Every event in order: Claude Code’s session, then Codex’s' },
    { t: 22400, scroll: top(a.codex.y, 360), at: a.codex, caption: 'Every event in order: Claude Code’s session, then Codex’s' },
  ]
}

function frameAt(keys, t) {
  const next = keys.findIndex((key) => key.t > t)
  if (next === -1) return keys.at(-1)
  if (next === 0) return keys[0]
  const [a, b] = [keys[next - 1], keys[next]]
  const x = ease((t - a.t) / (b.t - a.t))
  return { scroll: mix(a.scroll, b.scroll, x), at: { x: mix(a.at.x, b.at.x, x), y: mix(a.at.y, b.at.y, x) }, caption: b.caption === a.caption ? a.caption : x < 0.5 ? a.caption : b.caption }
}

async function recordDashboard(page, video, url, posterPath) {
  console.log('  dashboard: opening the project page')
  // The launch link sets the dashboard's access cookie; then open the project.
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.goto(new URL('/app/projects/pricing', url).href, { waitUntil: 'networkidle' })
  await page.getByText('Fix pricing.js bugs').first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: '*{transition:none!important;animation:none!important;scroll-behavior:auto!important}' })
  await page.evaluate(OVERLAY)
  const keys = tour(await anchors(page))
  console.log(`  dashboard: ${(keys.at(-1).t / 1000).toFixed(1)}s`)
  const length = keys.at(-1).t
  const FADE = 350
  let isPosterTaken = false
  for (let t = 0; t < length; t += FRAME_MS) {
    const { scroll, at, caption } = frameAt(keys, t)
    const fade = Math.max(0, 1 - t / FADE, 1 - (length - t) / FADE)
    const viewY = at.y - scroll
    await page.evaluate((state) => window.demoFrame(state), { scrollY: scroll, x: at.x, y: viewY, caption, fade })
    await page.mouse.move(at.x, viewY)
    const frame = await page.screenshot()
    await video.write(frame)
    if (!isPosterTaken && t >= 4600) {
      await page.evaluate(() => (document.getElementById('demo-caption').style.opacity = '0'))
      await page.screenshot({ path: posterPath, type: 'jpeg', quality: 88 })
      isPosterTaken = true
    }
  }
}

mkdirSync(out, { recursive: true })
const videoPath = join(out, 'continuum-demo.mp4')
const posterPath = join(out, 'continuum-demo.jpg')
// Rendered beside the final files and moved into place only when complete, so a failed run leaves the committed video intact.
const partial = (path) => path.replace(/(\.\w+)$/, '.partial$1')
let dashboard
let browser
let video
try {
  console.log('Starting the dashboard…')
  dashboard = await startDashboard()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  video = startFfmpeg(partial(videoPath))
  const split = SCENES.findIndex((scene) => scene.kind === 'dashboard')
  await recordScenes(page, video, SCENES.slice(0, split))
  await recordDashboard(page, video, dashboard.url, partial(posterPath))
  await recordScenes(page, video, SCENES.slice(split + 1))
  await video.close()
  video = undefined
  renameSync(partial(videoPath), videoPath)
  renameSync(partial(posterPath), posterPath)
  console.log(`Wrote ${videoPath} and ${posterPath}`)
} finally {
  video?.kill()
  await browser?.close()
  dashboard?.stop()
  rmSync(partial(videoPath), { force: true })
  rmSync(partial(posterPath), { force: true })
}
