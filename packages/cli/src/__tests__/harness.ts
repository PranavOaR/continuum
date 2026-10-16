import { Writable } from 'node:stream'
import type { Io } from '../io'
import { main } from '../main'

export const NOW = new Date('2026-10-16T12:00:00.000Z')

function sink(lines: string[]) {
  return new Writable({
    write(chunk, _encoding, done) {
      lines.push(chunk.toString())
      done()
    },
  })
}

/** Runs the CLI in-process and captures what it prints. */
export async function cli(cwd: string, argv: string[], extra: Partial<Io> = {}) {
  const out: string[] = []
  const err: string[] = []
  const raw: string[] = []
  const code = await main(argv, {
    cwd,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    now: () => NOW,
    stdout: sink(raw),
    stderr: sink(raw),
    ...extra,
  })
  return { code, out: out.join('\n'), err: err.join('\n'), raw: raw.join('') }
}
