import type { Writable } from 'node:stream'

/** Everything a command touches in the outside world, injected so commands are testable in-process. */
export interface Io {
  cwd: string
  out: (line: string) => void
  err: (line: string) => void
  now: () => Date
  /** Aborted on Ctrl-C / SIGTERM: stops `start` and the command under `run`. */
  signal: AbortSignal
  /** Reads all of stdin (hook payloads arrive there). */
  readStdin: () => Promise<string>
  /** Where Continuum keeps per-user state: the registry of connected repositories. */
  configDir: string
  /** Raw streams for child-process output (`run`); default to the process's own. */
  stdout?: Writable
  stderr?: Writable
}

export const EXIT_OK = 0
export const EXIT_FAILURE = 1
export const EXIT_USAGE = 2
/** Shell convention for "command not found". */
export const EXIT_NOT_FOUND = 127
