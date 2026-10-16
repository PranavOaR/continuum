import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { RESTART_EXIT } from '../commands/serve'
import { superviseServe, TOKEN_ENV, WORKER_ENV } from '../supervisor'

/** A worker that prints a dashboard link on the given port, then exits with the given code. */
function fakeWorker(port: number, exitCode: number): ChildProcess {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill: () => true })
  setTimeout(() => {
    child.stdout.write(`Continuum dashboard: http://127.0.0.1:${port}/app?token=t\n`)
    setTimeout(() => child.emit('exit', exitCode, null), 5)
  }, 5)
  return child as unknown as ChildProcess
}

describe('superviseServe', () => {
  it('restarts the worker on the same port and token after an update, then passes the final exit code through', async () => {
    const calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = []
    const exits = [RESTART_EXIT, RESTART_EXIT, 0]
    const output: string[] = []
    const code = await superviseServe(
      ['-C', '/repo', 'serve', '--port', '0'],
      (args, env) => {
        calls.push({ args, env })
        return fakeWorker(51234, exits[calls.length - 1])
      },
      (text) => output.push(text),
    )
    expect(code).toBe(0)
    expect(calls.map((call) => call.args)).toEqual([
      ['-C', '/repo', 'serve', '--port', '0'],
      ['-C', '/repo', 'serve', '--port', '0', '--port', '51234'],
      ['-C', '/repo', 'serve', '--port', '0', '--port', '51234'],
    ])
    expect(new Set(calls.map((call) => call.env[TOKEN_ENV])).size).toBe(1)
    expect(calls.every((call) => call.env[WORKER_ENV] === '1')).toBe(true)
    expect(output.join('')).toContain('Continuum dashboard:')
  })

  it('stops supervising when the worker fails', async () => {
    expect(await superviseServe(['serve'], () => fakeWorker(4747, 1), () => {})).toBe(1)
  })
})
