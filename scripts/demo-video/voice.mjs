// The demo video's voiceover: one clip per narration line, from ElevenLabs
// (or macOS `say`, to check timing for free), cached so that unchanged lines
// never cost credits again.
//
// ElevenLabs key: $ELEVENLABS_API_KEY, or the file ~/.config/elevenlabs/api-key.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** George, one of ElevenLabs' default voices, available on every plan. */
export const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb'
const MODEL = 'eleven_multilingual_v2'
export const DEFAULT_CACHE = join(homedir(), '.cache/continuum-demo-voice')

function apiKey() {
  const fromEnv = process.env.ELEVENLABS_API_KEY?.trim()
  if (fromEnv) return fromEnv
  const file = join(homedir(), '.config/elevenlabs/api-key')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  throw new Error('No ElevenLabs API key: set ELEVENLABS_API_KEY, or save the key in ~/.config/elevenlabs/api-key.')
}

async function elevenLabs({ text, previous, next, voice }, path) {
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

const macSay = ({ text }, path) => execFileSync('say', ['-v', 'Samantha', '-o', path, text])

export const duration = (path) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim())

/**
 * One spoken clip per line, with its length in seconds. A clip is generated
 * beside its cache entry and renamed into it only when complete, so a failure
 * is never cached.
 */
export async function speak(texts, { tts = 'elevenlabs', voice = DEFAULT_VOICE, cacheDir = DEFAULT_CACHE } = {}) {
  mkdirSync(cacheDir, { recursive: true })
  const clips = []
  for (const [index, text] of texts.entries()) {
    const line = { text, previous: texts[index - 1], next: texts[index + 1], voice }
    const key = createHash('sha256').update(JSON.stringify([tts, voice, MODEL, line.previous, text, line.next])).digest('hex').slice(0, 16)
    const path = join(cacheDir, `${key}.${tts === 'say' ? 'aiff' : 'mp3'}`)
    if (!existsSync(path)) {
      const pending = path.replace(/(\.\w+)$/, '.pending$1')
      try {
        if (tts === 'say') macSay(line, pending)
        else await elevenLabs(line, pending)
        renameSync(pending, path)
      } finally {
        rmSync(pending, { force: true })
      }
    }
    clips.push({ path, seconds: duration(path) })
  }
  return clips
}
