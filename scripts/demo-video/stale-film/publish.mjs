#!/usr/bin/env node
// Encodes the rendered stale-test film for the website and writes its captions next to it.
//   node scripts/demo-video/stale-film/publish.mjs [renders/stale-test-master.mp4]
// Same encode as the first film (../film/publish.mjs): H.264 High at level 4.0, 48 kHz audio,
// the mix normalised to -16 LUFS with peaks at or under -1.5 dBTP.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DIR = import.meta.dirname
const ROOT = join(DIR, '../../..')
const master = resolve(process.argv[2] ?? join(DIR, 'renders/stale-test-master.mp4'))
const out = join(ROOT, 'apps/web/site-public/demo')
const CRF = 20
const SAMPLE_RATE = 48_000

// The film has no narration: the captions are its on-screen headline, as index.html and the scenes time it.
const CUES = [
  [0.0, 2.2, 'Friday, 6:40 pm. The tests pass.'],
  [2.6, 5.6, 'Just one more line.'],
  [5.85, 7.6, 'Nobody re-runs the tests.'],
  [8.6, 11.3, 'The weekend.'],
  [11.3, 15.8, 'Monday, 9:12 am. Codex reads the briefing.'],
  [16.05, 20.3, 'The pass no longer counts.'],
  [20.55, 30.4, 'It re-runs. It fails.'],
  [30.65, 34.2, 'Fixed, and verified again.'],
  [34.4, 45.4, 'The task replay shows where it went stale.'],
  [45.8, 48.4, 'The tick goes amber when the code moves under it.'],
  [49.0, 53.5, 'Continuum. npx getcontinuum setup claude-code'],
]
const stamp = (s) => {
  const ms = Math.round(s * 1000)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
}

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', master,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', String(SAMPLE_RATE),
  '-movflags', '+faststart', join(out, 'stale-test.mp4'),
], { stdio: 'inherit' })
writeFileSync(join(out, 'stale-test.vtt'), `WEBVTT\n\n${CUES.map(([start, end, text]) => `${stamp(start)} --> ${stamp(end)}\n${text}`).join('\n\n')}\n`)
console.log(`Wrote ${join(out, 'stale-test.mp4')} and its captions; run node scripts/site/images.mjs to refresh its cover.`)
