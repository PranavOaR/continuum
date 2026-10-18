import { spawn, type ChildProcess } from 'node:child_process'
import { createAccessToken } from '@continuum/daemon'
import { RESTART_EXIT, type ServeOptions } from './commands/serve'
import { codeFingerprint } from './codeVersion'

/** Set in a serve worker's environment: it runs the dashboard; its parent restarts it after updates. */
export const WORKER_ENV = 'CONTINUUM_SERVE_WORKER'
/** A worker waits this long for its tokens before starting with fresh ones (open dashboards then need the new link). */
const SECRETS_TIMEOUT_MS = 10_000
/** A worker that fails this soon after an update restart is retried: the update may still have been in progress. */
const RESTART_GRACE_MS = 15_000
const MAX_RESTART_RETRIES = 3
const RETRY_DELAY_MS = 1_000

/** Sent to each worker over the IPC channel, never in the environment or argv where other tools could read it. */
interface WorkerSecrets {
  token: string
  csrfToken: string
}

export type SpawnWorker = (args: readonly string[], env: NodeJS.ProcessEnv) => ChildProcess

/** Runs this same CLI again as a worker, with the same Node.js flags (e.g. the tsx loader in a checkout) and an IPC channel. */
const spawnSelf: SpawnWorker = (args, env) =>
  spawn(process.execPath, [...process.execArgv, process.argv[1], ...args], { env, stdio: ['inherit', 'pipe', 'inherit', 'ipc'] })

interface Channel {
  send?: unknown
  once(event: 'message', listener: (message: unknown) => void): unknown
}

const isSecrets = (value: unknown): value is WorkerSecrets =>
  typeof value === 'object' && value !== null && typeof (value as WorkerSecrets).token === 'string' && typeof (value as WorkerSecrets).csrfToken === 'string'

/**
 * Options for a `serve` running as a worker: the tokens its supervisor keeps
 * across restarts, and a fingerprint of the code so it can ask for a restart.
 */
export async function serveWorkerOptions(env: NodeJS.ProcessEnv = process.env, channel: Channel = process): Promise<ServeOptions> {
  if (env[WORKER_ENV] !== '1' || typeof channel.send !== 'function') return {}
  const secrets = await new Promise<WorkerSecrets | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), SECRETS_TIMEOUT_MS)
    timer.unref()
    channel.once('message', (message) => {
      clearTimeout(timer)
      resolve(isSecrets(message) ? message : null)
    })
  })
  return { ...(secrets ? { token: secrets.token, csrfToken: secrets.csrfToken } : {}), codeFingerprint }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Keeps `continuum serve` running across updates: the dashboard runs in a
 * worker, and when the worker exits because Continuum's code changed (a
 * `git pull`, an upgrade), a new one starts on the same port with the same
 * tokens. Open dashboards reconnect on their own and their edits keep working.
 * Interrupts are passed to the worker, and its exit code becomes this process's.
 */
export async function superviseServe(argv: readonly string[], spawnWorker: SpawnWorker = spawnSelf, write: (text: string) => void = (text) => process.stdout.write(text)): Promise<number> {
  const env = { ...process.env, [WORKER_ENV]: '1' }
  const secrets: WorkerSecrets = { token: createAccessToken(), csrfToken: createAccessToken() }
  let args = [...argv]
  let child: ChildProcess | undefined
  let stopping = false
  // A terminal's Ctrl-C reaches the worker too; forwarding also covers a signal sent to this process alone.
  const forward = (signal: NodeJS.Signals) => () => {
    stopping = true
    child?.kill(signal)
  }
  const onInterrupt = forward('SIGINT')
  const onTerminate = forward('SIGTERM')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  let restartedAt: number | null = null
  let retries = 0
  try {
    for (;;) {
      const worker = spawnWorker(args, env)
      child = worker
      worker.send?.(secrets)
      let output = ''
      let port: string | undefined
      worker.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        if (!port) {
          output += text
          port = /http:\/\/127\.0\.0\.1:(\d+)\/app/.exec(output)?.[1]
        }
        write(text)
      })
      const code = await new Promise<number>((resolve) => {
        worker.once('error', () => resolve(1))
        worker.once('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)))
      })
      if (stopping) return code
      // Same port, so the link in the browser (and its cookie) keeps working.
      if (port) args = [...argv, '--port', port]
      if (code === RESTART_EXIT) {
        restartedAt = Date.now()
        retries = 0
        continue
      }
      const justRestarted = restartedAt !== null && Date.now() - restartedAt < RESTART_GRACE_MS
      if (code === 0 || !justRestarted || retries >= MAX_RESTART_RETRIES) return code
      retries += 1
      write(`continuum: the dashboard failed to start after the update; retrying (${retries}/${MAX_RESTART_RETRIES})…\n`)
      await delay(RETRY_DELAY_MS * retries)
      if (stopping) return code
    }
  } finally {
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
  }
}
