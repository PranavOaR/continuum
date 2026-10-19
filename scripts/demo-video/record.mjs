#!/usr/bin/env node
// Step 2 of the demo video: renders it from capture.mjs's real run, with the
// voiceover in narration.json. Each scene lasts as long as its narration needs.
// Terminal scenes replay the captured output; the dashboard scene is the real
// `continuum serve` for that repository, framed and zoomed onto what is said.
//
//   node scripts/demo-video/record.mjs --work <dir> [--tts say] [--voice <id>] [--out apps/web/site-public/demo] [--stills 1,8,30]
//
// Writes continuum-demo.mp4 and .vtt (captions). The cover image is designed, not a frame: scripts/site/images.mjs.
// Needs ffmpeg and Playwright's Chromium.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { anchors, beatState, dashboardBeats } from './dashboardTour.mjs'
import { muxVoice } from './mux.mjs'
import { speak } from './voice.mjs'

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
const out = resolve(option('--out') ?? join(ROOT, 'apps/web/site-public/demo'))
const capture = JSON.parse(readFileSync(join(work, 'capture.json'), 'utf8'))
const narration = JSON.parse(readFileSync(join(import.meta.dirname, 'narration.json'), 'utf8')).lines
const repo = join(work, 'pricing')

const FPS = 30
const VIEWPORT = { width: 1280, height: 720 }
/** Laid out at 1280×720, captured at 1920×1080; the dashboard at 2× so zooms stay sharp. */
const SCALE = 1.5
const DASHBOARD_SCALE = 2
/** Scenes overlap by this much while one glides into the next. */
const TRANSITION_S = 0.6
/** Silence before a scene's first line, and after each line. */
const LEAD_S = 0.45
const GAP_S = 0.35
const CWD = '~/continuum-demo/pricing'

const output = (name) => capture.steps.find((step) => step.name === name)?.output ?? ''
const firstLines = (text, count) => text.split('\n').slice(0, count).join('\n')
const handoffBody = (text) => text.split('\n').filter((line) => !line.startsWith('Generated ') && !line.startsWith('Evidence labels')).join('\n')
const npx = capture.package.replace(/@[\d.]+$/, '')
/** The task's title as the agent named it in this run (it differs from run to run), from the briefing Codex received. */
const TASK_TITLE = /\[agent-reported\] "([^"]+)"/.exec(output('handoff-before-codex'))?.[1]
if (!TASK_TITLE) throw new Error('capture.json has no task in the briefing before Codex: re-run capture.mjs')

const svg = (name) => readFileSync(join(ROOT, 'apps/web/src/assets/agent-logos', `${name}.svg`), 'utf8')
const LOGOS = [
  { icon: svg('claude-color'), wordmark: svg('claude-text') },
  { icon: svg('codex-color'), wordmark: svg('codex-text') },
  { icon: svg('cursor'), wordmark: svg('cursor-text') },
]

function scenesFor(port) {
  return [
    { id: 'intro', kind: 'intro', subtitle: 'Claude Code starts a task. Codex finishes it.', natural: 4.6 },
    {
      id: 'connect', kind: 'terminal', step: '01', caption: 'Connect both agents to the repository', title: 'zsh — pricing', cwd: CWD,
      steps: [
        { kind: 'cmd', text: `npx ${npx} setup claude-code` }, { kind: 'out', text: firstLines(output('setup-claude'), 3) },
        { kind: 'cmd', text: `npx ${npx} setup codex` }, { kind: 'out', text: firstLines(output('setup-codex'), 3) },
      ],
    },
    {
      id: 'claude', kind: 'terminal', step: '02', caption: 'Claude Code fixes one of the two bugs, records the task, and stops', title: 'claude — pricing', logo: LOGOS[0].icon, cwd: CWD,
      steps: [{ kind: 'cmd', text: `claude -p "${capture.prompts.claude}"` }, { kind: 'out', text: `\n${output('claude')}` }],
    },
    {
      id: 'briefing', kind: 'terminal', step: '03', caption: 'When Codex starts, Continuum briefs it with this', title: 'zsh — pricing', cwd: CWD, small: true,
      highlight: ['Next action:', 'Done:', '  - [x]'],
      steps: [{ kind: 'cmd', text: `npx ${npx} handoff` }, { kind: 'out', text: handoffBody(output('handoff-before-codex')) }],
    },
    {
      id: 'codex', kind: 'terminal', step: '04', caption: 'Codex picks up the same task and finishes it; you verify the result', title: 'codex — pricing', logo: LOGOS[1].icon, cwd: CWD,
      steps: [
        { kind: 'cmd', text: `codex exec "${capture.prompts.codex}"` }, { kind: 'out', text: `\n${output('codex')}\n` },
        { kind: 'cmd', text: `npx ${npx} run -- npm test` }, { kind: 'out', text: output('verified-run') },
      ],
    },
    { id: 'dashboard', kind: 'dashboard', port },
    { id: 'outro', kind: 'outro', command: `npx ${npx} setup claude-code`, url: 'continuumgroup.dev', natural: 4.2 },
  ]
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
  const port = await freePort()
  const env = { ...process.env, CONTINUUM_CONFIG_DIR: join(work, 'config'), npm_config_update_notifier: 'false' }
  // Its own process group, so stopping it also stops the node process npx starts.
  const server = spawn('npx', ['-y', capture.package, 'serve', '--port', String(port), repo], { cwd: repo, env, detached: true, stdio: ['ignore', 'pipe', 'inherit'] })
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
  return { url, port, stop }
}

function startFfmpeg(path) {
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path], { stdio: ['pipe', 'inherit', 'inherit'] })
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

/**
 * When each scene starts and how long it lasts, and when each line is spoken:
 * a scene runs as long as its own animation or its lines, whichever is longer.
 */
function timeline(scenes, clips, terminalSeconds) {
  const lineSeconds = (index) => clips[index].seconds + GAP_S
  let start = 0
  const lineStarts = []
  const timed = scenes.map((scene, index) => {
    const own = narration.map((line, lineIndex) => ({ line, lineIndex })).filter(({ line }) => line.scene === scene.id)
    const enter = index === 0 ? 0 : TRANSITION_S
    let natural = scene.natural ?? (scene.kind === 'terminal' ? 0.35 + terminalSeconds[scene.id] + 1.6 : 0)
    let beats
    if (scene.kind === 'dashboard') {
      beats = dashboardBeats(own.map(({ line, lineIndex }) => ({ id: line.beat, seconds: lineSeconds(lineIndex) })))
      natural = beats.at(-1).end
    }
    let at = start + enter + LEAD_S
    for (const { lineIndex, line } of own) {
      const beat = beats?.find((candidate) => candidate.id === line.beat)
      if (beat) at = start + enter + beat.start + 0.25
      lineStarts[lineIndex] = at
      at += lineSeconds(lineIndex)
    }
    const spoken = own.length > 0 ? at - start + 0.4 : 0
    const length = Math.max(natural + enter, spoken, 2) + TRANSITION_S
    const timedScene = { ...scene, start, length, enter, beats }
    start += length - TRANSITION_S
    return timedScene
  })
  return { scenes: timed, lineStarts, total: start + TRANSITION_S }
}

/** The layers to draw at time t: one scene, or two while one glides into the next. */
function layersAt(scenes, t) {
  return scenes
    .filter((scene) => t >= scene.start && t < scene.start + scene.length)
    .map((scene) => ({
      scene,
      t: t - scene.start,
      enter: scene.start === 0 ? 1 : Math.min(1, (t - scene.start) / TRANSITION_S),
      exit: Math.max(0, (t - (scene.start + scene.length - TRANSITION_S)) / TRANSITION_S),
    }))
}

/** Draws the frame at time t; the dashboard is screenshotted again only when its scroll changed. */
function framer(compose, dashboardPage, plan, box) {
  let lastScroll = null
  let image = ''
  return async (t) => {
    const layers = layersAt(plan.scenes, t)
    for (const layer of layers) {
      if (layer.scene.kind !== 'dashboard') continue
      const state = beatState(layer.scene.beats, box, Math.max(0, layer.t - layer.scene.enter))
      // Zoom, cursor and caption are drawn by the compositor, so a still page reuses its screenshot.
      if (state.scroll !== lastScroll) {
        await dashboardPage.evaluate((y) => window.scrollTo(0, y), state.scroll)
        image = `data:image/png;base64,${(await dashboardPage.screenshot()).toString('base64')}`
        lastScroll = state.scroll
      }
      layer.frame = { ...state, image }
    }
    await compose.evaluate((value) => window.renderFrame(value), layers)
    return layers
  }
}

async function render(draw, compose, plan, videoPath) {
  const video = startFfmpeg(videoPath)
  try {
    for (let frame = 0; frame < Math.ceil(plan.total * FPS); frame += 1) {
      const t = frame / FPS
      await draw(t)
      await video.write(await compose.screenshot())
      if (frame % (FPS * 5) === 0) console.log(`  ${t.toFixed(0)}s / ${plan.total.toFixed(0)}s`)
    }
    await video.close()
  } catch (error) {
    video.kill()
    throw error
  }
}

mkdirSync(out, { recursive: true })
const final = { video: join(out, 'continuum-demo.mp4'), captions: join(out, 'continuum-demo.vtt') }
// Rendered beside the final files and moved into place only when complete, so a failed run leaves the committed video intact.
const partial = (path) => path.replace(/(\.\w+)$/, '.partial$1')
const silent = join(work, 'continuum-demo.silent.mp4')
let dashboard
let browser
try {
  console.log('Voice…')
  const clips = await speak(narration.map((line) => line.text), { tts: option('--tts'), voice: option('--voice') })
  console.log('Starting the dashboard…')
  dashboard = await startDashboard()
  browser = await chromium.launch()
  const compose = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  await compose.goto(pathToFileURL(join(import.meta.dirname, 'compose.html')).href)
  await compose.evaluate((logos) => (window.LOGOS = logos), LOGOS)
  await compose.evaluate(() => document.fonts.ready)
  const dashboardPage = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DASHBOARD_SCALE })
  // The launch link sets the dashboard's access cookie; then open the project.
  await dashboardPage.goto(dashboard.url, { waitUntil: 'networkidle' })
  await dashboardPage.goto(new URL('/app/projects/pricing', dashboard.url).href, { waitUntil: 'networkidle' })
  await dashboardPage.getByText(TASK_TITLE).first().waitFor()
  await dashboardPage.addStyleTag({ content: '*{transition:none!important;animation:none!important;scroll-behavior:auto!important}' })

  const scenes = scenesFor(dashboard.port)
  const terminalSeconds = Object.fromEntries(
    await Promise.all(scenes.filter((scene) => scene.kind === 'terminal').map(async (scene) => [scene.id, await compose.evaluate((value) => window.terminalSeconds(value), scene)])),
  )
  const plan = timeline(scenes, clips, terminalSeconds)
  for (const scene of plan.scenes) console.log(`  ${scene.id.padEnd(10)} ${scene.start.toFixed(1)}s +${scene.length.toFixed(1)}s`)

  const draw = framer(compose, dashboardPage, plan, await anchors(dashboardPage, TASK_TITLE))
  const stills = option('--stills')
  if (stills) {
    // A quick look: just these moments (seconds), as images in <work>/stills.
    mkdirSync(join(work, 'stills'), { recursive: true })
    console.log('Dashboard anchors:', JSON.stringify(await anchors(dashboardPage, TASK_TITLE)))
    for (const seconds of stills.split(',').map(Number)) {
      await draw(seconds)
      await compose.screenshot({ path: join(work, 'stills', `${String(seconds).padStart(5, '0')}.png`) })
    }
    console.log(`Wrote stills to ${join(work, 'stills')}`)
  } else {
    console.log('Rendering…')
    await render(draw, compose, plan, silent)
    console.log('Voice and captions…')
    muxVoice({ silent, clips, lineStarts: plan.lineStarts, texts: narration.map((line) => line.text), total: plan.total, video: partial(final.video), captions: partial(final.captions) })
    for (const path of Object.values(final)) renameSync(partial(path), path)
    console.log(`Wrote ${final.video} (${plan.total.toFixed(1)}s) and ${final.captions}. Run scripts/site/images.mjs to update the cover's length.`)
  }
} finally {
  await browser?.close()
  dashboard?.stop()
  for (const path of Object.values(final)) rmSync(partial(path), { force: true })
}
