import { spawn, type ChildProcess } from 'node:child_process'
import { createAccessToken } from '@continuum/daemon'
import { RESTART_EXIT } from './commands/serve'
import { codeFingerprint } from './codeVersion'

/** Set in a serve worker's environment: it runs the dashboard; its parent restarts it after updates. */
export const WORKER_ENV = 'CONTINUUM_SERVE_WORKER'
/** The access token a worker reuses, so a restart keeps open dashboards signed in. */
export const TOKEN_ENV = 'CONTINUUM_SERVE_TOKEN'

export type SpawnWorker = (args: readonly string[], env: NodeJS.ProcessEnv) => ChildProcess

/** Runs this same CLI again as a worker, with the same Node.js flags (e.g. the tsx loader in a checkout). */
const spawnSelf: SpawnWorker = (args, env) =>
  spawn(process.execPath, [...process.execArgv, process.argv[1], ...args], { env, stdio: ['inherit', 'pipe', 'inherit'] })

/** Options for a `serve` running as a worker: reuse the token and exit for a restart when the code changes. */
export function serveWorkerOptions(env: NodeJS.ProcessEnv = process.env) {
  if (env[WORKER_ENV] !== '1') return {}
  return { ...(env[TOKEN_ENV] ? { token: env[TOKEN_ENV] } : {}), codeFingerprint }
}

/**
 * Keeps `continuum serve` running across updates: the dashboard runs in a
 * worker, and when the worker exits because Continuum's code changed (a
 * `git pull`, an upgrade), a new one starts on the same port with the same
 * token. Open dashboards reconnect on their own. Interrupts are passed to the
 * worker, and its exit code becomes this process's.
 */
export async function superviseServe(argv: readonly string[], spawnWorker: SpawnWorker = spawnSelf, write: (text: string) => void = (text) => process.stdout.write(text)): Promise<number> {
  const env = { ...process.env, [WORKER_ENV]: '1', [TOKEN_ENV]: createAccessToken() }
  let args = [...argv]
  let child: ChildProcess | undefined
  // A terminal's Ctrl-C reaches the worker too; forwarding also covers a SIGINT sent to this process alone.
  const forwardInterrupt = () => child?.kill('SIGINT')
  const forwardTerminate = () => child?.kill('SIGTERM')
  process.on('SIGINT', forwardInterrupt)
  process.on('SIGTERM', forwardTerminate)
  try {
    for (;;) {
      const worker = spawnWorker(args, env)
      child = worker
      let port: string | undefined
      worker.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        port ??= /http:\/\/127\.0\.0\.1:(\d+)\/app/.exec(text)?.[1]
        write(text)
      })
      const code = await new Promise<number>((resolve) => {
        worker.once('error', () => resolve(1))
        worker.once('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)))
      })
      if (code !== RESTART_EXIT) return code
      // Same port, so the link in the browser (and its cookie) keeps working.
      if (port) args = [...argv, '--port', port]
    }
  } finally {
    process.off('SIGINT', forwardInterrupt)
    process.off('SIGTERM', forwardTerminate)
  }
}
