#!/usr/bin/env node
// Encodes the rendered film for the website and writes its captions next to it.
//   node scripts/demo-video/film/publish.mjs [renders/continuum-demo-master.mp4]
// H.264 High at level 4.0 and 48 kHz audio play on every phone (scripts/check-website.mjs checks both);
// the mix is normalised to -16 LUFS with peaks at or under -1.5 dBTP.
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const DIR = import.meta.dirname
const ROOT = join(DIR, '../../..')
const master = resolve(process.argv[2] ?? join(DIR, 'renders/continuum-demo-master.mp4'))
const out = join(ROOT, 'apps/web/site-public/demo')
const CRF = 20
const SAMPLE_RATE = 48_000

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-i', master,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', String(SAMPLE_RATE),
  '-movflags', '+faststart', join(out, 'continuum-demo.mp4'),
], { stdio: 'inherit' })
execFileSync(process.execPath, [join(DIR, 'captions.mjs'), join(out, 'continuum-demo.vtt')], { stdio: 'inherit' })
console.log(`Wrote ${join(out, 'continuum-demo.mp4')}; run node scripts/site/images.mjs to refresh its cover.`)
