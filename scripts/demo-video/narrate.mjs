#!/usr/bin/env node
// Step 3 of the demo video: adds the voiceover in narration.json to the silent
// recording. Each line starts at its scene; when a line runs longer than the
// scene, the scene's last frame is held until the line ends.
//
//   node scripts/demo-video/narrate.mjs                 # ElevenLabs (needs an API key)
//   node scripts/demo-video/narrate.mjs --tts say       # macOS voice, to check timing for free
//
// ElevenLabs key: $ELEVENLABS_API_KEY, or the file ~/.config/elevenlabs/api-key.
// Clips are cached in ~/.cache/continuum-demo-voice, so a re-run spends no credits.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const HERE = import.meta.dirname
const ROOT = join(HERE, '../..')
const args = process.argv.slice(2)
/** The value after `name`; a missing value (the end, or another --flag) is an error, not a path. */
const option = (name) => {
  if (!args.includes(name)) return undefined
  const value = args[args.indexOf(name) + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`)
  return value
}

const video = resolve(option('--video') ?? join(HERE, 'continuum-demo.silent.mp4'))
const out = resolve(option('--out') ?? join(ROOT, 'apps/web/public/demo/continuum-demo.mp4'))
const script = JSON.parse(readFileSync(resolve(option('--script') ?? join(HERE, 'narration.json')), 'utf8'))
const tts = option('--tts') ?? 'elevenlabs'
const cacheDir = resolve(option('--cache') ?? join(homedir(), '.cache/continuum-demo-voice'))

/** George, one of ElevenLabs' default voices, available on every plan. */
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb'
const MODEL = 'eleven_multilingual_v2'
const voice = option('--voice') ?? DEFAULT_VOICE
/** Silence before a line starts, and after it ends before the next scene. */
const LEAD_S = 0.25
const TAIL_S = 0.45
/** Integrated loudness of the voiceover: the usual target for speech in web video. */
const LOUDNESS_LUFS = -16

function apiKey() {
  const fromEnv = process.env.ELEVENLABS_API_KEY?.trim()
  if (fromEnv) return fromEnv
  const file = join(homedir(), '.config/elevenlabs/api-key')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  throw new Error('No ElevenLabs API key: set ELEVENLABS_API_KEY, or save the key in ~/.config/elevenlabs/api-key.')
}

async function elevenLabs(text, previous, next, path) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json', accept: 'audio/mpeg' },
    // The neighbouring lines keep the intonation continuous across clips.
    body: JSON.stringify({ text, model_id: MODEL, previous_text: previous, next_text: next, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    const hint = response.status === 401 ? ' Check the API key, and that it may use Text to Speech.' : response.status === 402 || /quota/i.test(detail) ? ' The monthly character quota is used up.' : ''
    throw new Error(`ElevenLabs answered ${response.status}.${hint} ${detail}`)
  }
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}

function macSay(text, path) {
  execFileSync('say', ['-v', 'Samantha', '-o', path, text])
}

/** The clip for one line, from the cache when this exact text and voice were spoken before. */
async function clip(index) {
  const { text } = script.lines[index]
  const previous = script.lines[index - 1]?.text
  const next = script.lines[index + 1]?.text
  const key = createHash('sha256').update(JSON.stringify([tts, voice, MODEL, previous, text, next])).digest('hex').slice(0, 16)
  const path = join(cacheDir, `${key}.${tts === 'say' ? 'aiff' : 'mp3'}`)
  if (!existsSync(path)) {
    // Generated beside the cache entry and renamed into it only when complete, so a failure is never cached.
    const pending = path.replace(/(\.\w+)$/, '.pending$1')
    try {
      if (tts === 'say') macSay(text, pending)
      else await elevenLabs(text, previous, next, pending)
      renameSync(pending, path)
    } finally {
      rmSync(pending, { force: true })
    }
  }
  return path
}

const duration = (path) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim())

mkdirSync(cacheDir, { recursive: true })
const clips = []
for (const [index, line] of script.lines.entries()) {
  const path = await clip(index)
  const end = script.lines[index + 1]?.start ?? script.end
  const speech = duration(path)
  clips.push({ path, start: line.start, end, speech, hold: Math.max(0, LEAD_S + speech + TAIL_S - (end - line.start)) })
}

// Video: each scene's span, plus a held last frame where its line needs longer. Audio: each line at its span's start.
const filters = []
let at = 0
for (const [index, segment] of clips.entries()) {
  filters.push(`[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${segment.hold.toFixed(3)}[v${index}]`)
  const delay = Math.round((at + LEAD_S) * 1000)
  filters.push(`[${index + 1}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${delay}|${delay}[a${index}]`)
  console.log(`${String(index + 1).padStart(2)}  ${segment.speech.toFixed(1)}s of speech in ${(segment.end - segment.start).toFixed(1)}s of video${segment.hold > 0 ? `, held ${segment.hold.toFixed(1)}s` : ''}`)
  at += segment.end - segment.start + segment.hold
}
filters.push(`${clips.map((_, index) => `[v${index}]`).join('')}concat=n=${clips.length}:v=1:a=0[v]`)
// Lines never overlap, so mixing cannot clip; loudnorm brings speech to the usual level for web video.
filters.push(`${clips.map((_, index) => `[a${index}]`).join('')}amix=inputs=${clips.length}:normalize=0,loudnorm=I=${LOUDNESS_LUFS}:TP=-1.5:LRA=11,apad[a]`)

const partial = out.replace(/(\.\w+)$/, '.partial$1')
try {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', video, ...clips.flatMap((segment) => ['-i', segment.path]),
    '-filter_complex', filters.join(';'), '-map', '[v]', '-map', '[a]', '-t', at.toFixed(3),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', partial,
  ], { stdio: 'inherit' })
  renameSync(partial, out)
} finally {
  rmSync(partial, { force: true })
}
console.log(`Wrote ${out} (${at.toFixed(1)}s, voice: ${tts === 'say' ? 'macOS say' : `ElevenLabs ${voice}`})`)
