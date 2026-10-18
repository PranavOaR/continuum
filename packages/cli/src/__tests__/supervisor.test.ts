import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { RESTART_EXIT } from '../commands/serve'
import { serveWorkerOptions, superviseServe, WORKER_ENV } from '../supervisor'

interface FakeWorker {
  child: ChildProcess
  sent: unknown[]
}

/** A worker that prints a dashboard link on the given port (split across two chunks), then exits with the given code. */
function fakeWorker(port: number, exitCode: number, beforeExit: () => void = () => {}): FakeWorker {
  const sent: unknown[] = []
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    kill: () => true,
    send: (message: unknown) => sent.push(message),
  })
  setTimeout(() => {
    child.stdout.write('Continuum dashboard: http://127.0.0.1:')
    child.stdout.write(`${port}/app?token=t\n`)
    setTimeout(() => {
      beforeExit()
      child.emit('exit', exitCode, null)
    }, 5)
  }, 5)
  return { child: child as unknown as ChildProcess, sent }
}

describe('superviseServe', () => {
  it('restarts the worker on the same port with the same tokens, sent over IPC rather than the environment', async () => {
    const workers: FakeWorker[] = []
    const calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = []
    const exits = [RESTART_EXIT, RESTART_EXIT, 0]
    const code = await superviseServe(
      ['-C', '/repo', 'serve', '--port', '0'],
      (args, env) => {
        calls.push({ args, env })
        const worker = fakeWorker(51234, exits[workers.length])
        workers.push(worker)
        return worker.child
      },
      () => {},
    )
    expect(code).toBe(0)
    expect(calls.map((call) => call.args)).toEqual([
      ['-C', '/repo', 'serve', '--port', '0'],
      ['-C', '/repo', 'serve', '--port', '0', '--port', '51234'],
      ['-C', '/repo', 'serve', '--port', '0', '--port', '51234'],
    ])
    const [first] = workers[0].sent as { token: string; csrfToken: string }[]
    expect(first.token).toMatch(/^[\w-]{20,}$/)
    expect(workers.every((worker) => JSON.stringify(worker.sent) === JSON.stringify([first]))).toBe(true)
    expect(JSON.stringify(calls.map((call) => call.env))).not.toContain(first.token)
    expect(calls.every((call) => call.env[WORKER_ENV] === '1')).toBe(true)
  })

  it('retries a worker that fails right after an update, then gives up', async () => {
    let spawned = 0
    const exits = [RESTART_EXIT, 1, 1, 1, 1]
    const code = await superviseServe(['serve'], () => fakeWorker(4747, exits[spawned++]).child, () => {})
    expect(code).toBe(1)
    expect(spawned).toBe(5) // the first worker, the restart, then three retries
  }, 15_000)

  it('stops when interrupted during a restart instead of starting another worker', async () => {
    let spawned = 0
    const code = await superviseServe(
      ['serve'],
      () => {
        spawned += 1
        // Ctrl-C lands just as the worker exits to restart.
        return fakeWorker(4747, RESTART_EXIT, () => process.emit('SIGINT')).child
      },
      () => {},
    )
    expect(code).toBe(RESTART_EXIT)
    expect(spawned).toBe(1)
  })

  it('stops supervising when the worker fails outside an update', async () => {
    expect(await superviseServe(['serve'], () => fakeWorker(4747, 1).child, () => {})).toBe(1)
  })
})

describe('serveWorkerOptions', () => {
  it('reads the tokens its supervisor sends', async () => {
    const channel = Object.assign(new EventEmitter(), { send: () => true })
    const options = serveWorkerOptions({ [WORKER_ENV]: '1' }, channel)
    channel.emit('message', { token: 'access-token', csrfToken: 'csrf-token' })
    expect(await options).toMatchObject({ token: 'access-token', csrfToken: 'csrf-token', codeFingerprint: expect.any(Function) })
  })

  it('does nothing outside a supervised worker', async () => {
    expect(await serveWorkerOptions({}, Object.assign(new EventEmitter(), { send: () => true }))).toEqual({})
  })
})
