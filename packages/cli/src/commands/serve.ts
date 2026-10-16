import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isInitialized, locateWorkspace, NotAGitRepositoryError, NotInitializedError, readRegistry, type Workspace } from '@continuum/capture'
import { createAccessToken, createChangeFeed, DEFAULT_PORT, LocalContinuumService, projectIds, startDaemon } from '@continuum/daemon'
import { basename, resolve } from 'node:path'
import { BUILD_INFO } from '../build'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

export const SERVE_USAGE = 'Usage: continuum serve [--port <n>] [repository ...]'
const MAX_PORT = 65_535

/** The dashboard shipped next to the release bundle, or the web app built in this checkout (`npm run build`). */
export const WEB_DIST = BUILD_INFO
  ? fileURLToPath(new URL('./web', import.meta.url))
  : fileURLToPath(new URL('../../../../apps/web/dist', import.meta.url))

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

/** Repositories named on the command line must all be set up: a typo should not silently serve less. */
async function namedWorkspaces(io: Io, paths: readonly string[]): Promise<Workspace[]> {
  const workspaces = await Promise.all(paths.map((path) => locateWorkspace(resolve(io.cwd, path))))
  const missing = workspaces.find((workspace) => !isInitialized(workspace))
  if (missing) throw new NotInitializedError(missing.root)
  return workspaces
}

/**
 * With no arguments: every repository connected with `continuum setup`, plus
 * the one you are in. Registered repositories that were moved, deleted or
 * uninstalled are skipped with a note.
 */
async function everyConnectedWorkspace(io: Io): Promise<Workspace[]> {
  const here = await locateWorkspace(io.cwd).catch((error: unknown) => {
    if (error instanceof NotAGitRepositoryError) return null
    throw error
  })
  const registered = await Promise.all(
    (await readRegistry(io.configDir)).map(async ({ root }) => {
      const workspace = await locateWorkspace(root).catch(() => null)
      if (!workspace || !isInitialized(workspace)) io.err(`continuum: skipping ${root}: no longer set up (run \`continuum setup claude-code\` there to add it back)`)
      return workspace && isInitialized(workspace) ? workspace : null
    }),
  )
  const workspaces = [...(here && isInitialized(here) ? [here] : []), ...registered.filter((workspace): workspace is Workspace => workspace !== null)]
  if (workspaces.length === 0) throw new NotInitializedError(here?.root ?? io.cwd)
  return workspaces
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
  const workspaces = parsed.repositories.length > 0 ? await namedWorkspaces(io, parsed.repositories) : await everyConnectedWorkspace(io)
  const unique = [...new Map(workspaces.map((workspace) => [workspace.root, workspace])).values()]
  const ids = projectIds(unique.map((workspace) => basename(workspace.root)))
  const describeError = (error: unknown) => (error instanceof Error ? (error.stack ?? error.message) : String(error))
  const service = new LocalContinuumService(
    unique.map((workspace, index) => ({ projectId: ids[index], cwd: workspace.root })),
    { onError: (projectId, error) => io.err(`continuum: could not read ${projectId}: ${describeError(error)}`) },
  )
  const hasDashboard = existsSync(webDist)
  // New records must not wait out the service's short snapshot cache.
  const changes = createChangeFeed(
    unique.map((workspace, index) => ({ projectId: ids[index], storePath: workspace.storePath })),
    { onChange: () => service.invalidate() },
  )

  const daemon = await startDaemon({
    service,
    version,
    token: createAccessToken(),
    port: parsed.port,
    changes,
    ...(hasDashboard ? { staticDir: webDist } : {}),
    onError: (error) => io.err(`continuum: ${describeError(error)}`),
  })
  // The link carries this run's access token; other users on this machine cannot open the dashboard without it.
  io.out(`Continuum dashboard: ${daemon.launchUrl}`)
  for (const workspace of unique) io.out(`  serving ${workspace.root}`)
  if (!hasDashboard) io.out(`  (the dashboard was not found at ${webDist}, so only the API is available; in a checkout, run \`npm run build\`)`)
  io.out('Open that exact link: it carries a one-time access token. Only this machine can reach the dashboard. Press Ctrl-C to stop.')
  await untilAborted(io.signal)
  await daemon.close()
  io.out('Stopped.')
  return EXIT_OK
}
