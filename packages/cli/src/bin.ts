#!/usr/bin/env node
import './warnings'
import { defaultConfigDir } from '@continuum/capture'
import { commandName, handlesInterrupts, main } from './main'
import { superviseServe, WORKER_ENV } from './supervisor'

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

// Output piped into something that stops reading (`continuum status | head`) is not an error.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(process.exitCode ?? 0)
    throw error
  })
}

const argv = process.argv.slice(2)
// `serve` runs under a supervisor that restarts it when Continuum is updated; the worker is a plain serve.
const supervise = commandName(argv) === 'serve' && process.env[WORKER_ENV] !== '1' && !argv.includes('--help')
const controller = new AbortController()
// Only long-running commands trap signals; hooks and the MCP server must die when Claude Code stops them.
/** Interrupts after which a stuck command is ended outright: Ctrl-C from a terminal can arrive twice under the serve supervisor. */
const FORCE_EXIT_AFTER = 3
const SIGNAL_EXIT_CODE = 130
let interrupts = 0
if (!supervise && handlesInterrupts(argv)) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      interrupts += 1
      if (interrupts === 1) controller.abort()
      else if (interrupts >= FORCE_EXIT_AFTER) process.exit(SIGNAL_EXIT_CODE)
    })
  }
}

process.exitCode = supervise
  ? await superviseServe(argv)
  : await main(argv, {
      cwd: process.cwd(),
      out: (line) => process.stdout.write(`${line}\n`),
      err: (line) => process.stderr.write(`${line}\n`),
      now: () => new Date(),
      signal: controller.signal,
      readStdin,
      configDir: defaultConfigDir(),
    })
