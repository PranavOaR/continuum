#!/usr/bin/env node
import { main } from './main'

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

const controller = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort())

process.exitCode = await main(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  now: () => new Date(),
  signal: controller.signal,
  readStdin,
})
