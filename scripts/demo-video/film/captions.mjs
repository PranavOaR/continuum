#!/usr/bin/env node
// Writes the film's WebVTT captions from the voice's word timings
// (assets/audio/voice-timing.json) and where index.html places each line.
//
//   node scripts/demo-video/film/captions.mjs [out.vtt]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = import.meta.dirname
const out = process.argv[2] ?? join(DIR, 'renders/continuum-demo.vtt')
const timing = JSON.parse(readFileSync(join(DIR, 'assets/audio/voice-timing.json'), 'utf8'))
const html = readFileSync(join(DIR, 'index.html'), 'utf8')
/** A cue holds at most this many characters, and ends at a sentence or clause when it can. */
const MAX_CHARS = 64
const MIN_HOLD_S = 1.2
/** A long cue may also end at a comma. */
const COMMA_BREAK_CHARS = 36

// Each voice clip: where it starts in the film, and where in the take.
// Attributes in any order: Studio adds its own (data-hf-id) to tags it edits.
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
const clips = [...html.matchAll(/<audio\b[^>]*>/g)]
  .map(([tag]) => ({ id: attr(tag, 'id'), start: attr(tag, 'data-start'), media: attr(tag, 'data-media-start') }))
  .filter(({ id }) => /^vo-\d+$/.test(id ?? ''))
  .map(({ id, start, media }) => ({ line: Number(id.slice(3)), offset: Number(start) - Number(media) }))

const stamp = (s) => {
  const ms = Math.round(s * 1000)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
}

const cues = []
for (const { line, offset } of clips) {
  const words = timing.lines[line].words.map((w) => ({ text: w.w, start: w.s + offset, end: w.e + offset }))
  let current = []
  const flush = () => {
    if (current.length === 0) return
    cues.push({ start: current[0].start, end: current.at(-1).end, text: current.map((w) => w.text).join(' ') })
    current = []
  }
  for (const word of words) {
    const length = [...current, word].map((w) => w.text).join(' ').length
    if (length > MAX_CHARS) flush()
    current.push(word)
    const sofar = current.map((w) => w.text).join(' ').length
    if ((/[.!?]$/.test(word.text) && sofar > 18) || (/,$/.test(word.text) && sofar >= COMMA_BREAK_CHARS)) flush()
  }
  flush()
}
// Hold each cue long enough to read, without running into the next.
const timed = cues.map((cue, i) => ({ ...cue, end: Math.min(Math.max(cue.end + 0.25, cue.start + MIN_HOLD_S), cues[i + 1]?.start ?? Infinity) }))
const body = timed.map((cue) => `${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text.replaceAll('...', '…')}`).join('\n\n')
writeFileSync(out, `WEBVTT\n\n${body}\n`)
console.log(`Wrote ${timed.length} cues to ${out}`)
