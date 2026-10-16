import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isInitialized, locateWorkspace, NotInitializedError } from '@continuum/capture'
import { DEFAULT_PORT, LocalContinuumService, projectIds, startDaemon } from '@continuum/daemon'
import { basename, resolve } from 'node:path'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const SERVE_USAGE = 'Usage: continuum serve [--port <n>] [repository ...]'
const MAX_PORT = 65_535

/** The web app built from this checkout (`npm run build`). */
export const WEB_DIST = fileURLToPath(new URL('../../../../apps/web/dist', import.meta.url))

interface ServeArgs {
  port: number
  repositories: string[]
}

function parseServeArgs(args: readonly string[]): ServeArgs | { error: string } {
  let port = DEFAULT_PORT
  const repositories: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--port') {
      const value = Number(args[index + 1])
      if (!Number.isInteger(value) || value < 0 || value > MAX_PORT) return { error: '--port needs a number between 0 and 65535' }
      port = value
      index += 1
    } else if (token.startsWith('-')) return { error: `Unknown option for serve: ${token}` }
    else repositories.push(token)
  }
  return { port, repositories }
}

function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    if (signal.aborted) done()
    else signal.addEventListener('abort', () => done(), { once: true })
  })
}

/** Serves the dashboard for one or more initialized repositories on 127.0.0.1 until Ctrl-C. */
export async function serveCommand(io: Io, args: readonly string[], version: string, webDist = WEB_DIST): Promise<number> {
  const parsed = parseServeArgs(args)
  if ('error' in parsed) {
    io.err(`continuum: ${parsed.error}`)
    io.err(SERVE_USAGE)
    return EXIT_USAGE
  }
  const workspaces = await Promise.all((parsed.repositories.length > 0 ? parsed.repositories : ['.']).map((path) => locateWorkspace(resolve(io.cwd, path))))
  const missing = workspaces.find((workspace) => !isInitialized(workspace))
  if (missing) throw new NotInitializedError(missing.root)
  const unique = [...new Map(workspaces.map((workspace) => [workspace.root, workspace])).values()]
  const ids = projectIds(unique.map((workspace) => basename(workspace.root)))
  const service = new LocalContinuumService(unique.map((workspace, index) => ({ projectId: ids[index], cwd: workspace.root })))
  const hasDashboard = existsSync(webDist)

  const daemon = await startDaemon({
    service,
    version,
    port: parsed.port,
    ...(hasDashboard ? { staticDir: webDist } : {}),
    onError: (error) => io.err(`continuum: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`),
  })
  io.out(`Continuum dashboard: ${daemon.url}`)
  for (const workspace of unique) io.out(`  serving ${workspace.root}`)
  if (!hasDashboard) io.out('  (the web app is not built, so only the API is available; run `npm run build` in the Continuum checkout)')
  io.out('Only this machine can reach it. Press Ctrl-C to stop.')
  await untilAborted(io.signal)
  await daemon.close()
  io.out('Stopped.')
  return EXIT_OK
}
