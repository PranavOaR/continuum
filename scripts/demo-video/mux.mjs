// Puts the voiceover on the rendered video, and writes its captions.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

/** Integrated loudness of the voiceover: the usual target for speech in web video. */
const LOUDNESS_LUFS = -16
/**
 * Output sample rate. loudnorm resamples to 192 kHz, and AAC above 48 kHz does
 * not play on iOS Safari or many Android phones: the whole video fails to load.
 */
const SAMPLE_RATE = 48000

/** WebVTT time: 00:01:02.345 */
const vttTime = (seconds) => new Date(Math.max(0, seconds) * 1000).toISOString().slice(11, 23)

/** One caption per sentence, sharing the line's spoken time in proportion to their length. */
function cues(text, start, seconds) {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0)
  let at = start
  return sentences.map((sentence) => {
    const end = at + (seconds * sentence.length) / total
    const cue = `${vttTime(at)} --> ${vttTime(end)}\n${sentence}`
    at = end
    return cue
  })
}

/**
 * Adds each line's clip at its start time (lines never overlap, so mixing
 * cannot clip), normalizes loudness, keeps the video stream as it is, and
 * writes WebVTT captions with the same timing.
 */
export function muxVoice({ silent, clips, lineStarts, texts, total, video, captions }) {
  const filters = clips.map((_, index) => {
    const delay = Math.round(lineStarts[index] * 1000)
    return `[${index + 1}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${delay}|${delay}[a${index}]`
  })
  filters.push(`${clips.map((_, index) => `[a${index}]`).join('')}amix=inputs=${clips.length}:normalize=0,loudnorm=I=${LOUDNESS_LUFS}:TP=-1.5:LRA=11,aresample=${SAMPLE_RATE},apad[a]`)
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', silent, ...clips.flatMap((clip) => ['-i', clip.path]),
    '-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[a]', '-t', total.toFixed(3),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', String(SAMPLE_RATE), '-movflags', '+faststart', '-f', 'mp4', video,
  ], { stdio: 'inherit' })
  const all = texts.flatMap((text, index) => cues(text, lineStarts[index], clips[index].seconds))
  writeFileSync(captions, `WEBVTT\n\n${all.join('\n\n')}\n`)
}
