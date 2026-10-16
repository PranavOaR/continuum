import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { NotFoundError, type ContinuumService } from '@continuum/core'

export const LOOPBACK = '127.0.0.1'
export const DEFAULT_PORT = 4747
const MAX_QUERY_CHARS = 200

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
}

export interface DaemonOptions {
  service: ContinuumService
  version: string
  /** Built web app to serve; without it only the API is available. */
  staticDir?: string
  port?: number
  onError?: (error: unknown) => void
}

export interface RunningDaemon {
  url: string
  port: number
  close(): Promise<void>
}

type Handler = (service: ContinuumService, params: Record<string, string>, query: URLSearchParams) => Promise<unknown>

const ROUTES: readonly (readonly [RegExp, Handler])[] = [
  [/^\/api\/overview$/, (service) => service.getOverview()],
  [/^\/api\/projects$/, (service) => service.listProjects()],
  [/^\/api\/tasks$/, (service) => service.listTasks()],
  [/^\/api\/activity$/, (service) => service.listActivity()],
  [/^\/api\/projects\/(?<id>[^/]+)\/workspace$/, (service, params) => service.getWorkspace(params.id)],
  [/^\/api\/projects\/(?<id>[^/]+)\/graph$/, (service, params) => service.getMemoryGraph(params.id)],
  [/^\/api\/projects\/(?<id>[^/]+)\/briefing$/, (service, params) => service.getBriefing(params.id)],
  [/^\/api\/search$/, (service, _params, query) => service.search((query.get('q') ?? '').slice(0, MAX_QUERY_CHARS))],
]

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS })
  response.end(JSON.stringify(body))
}

const fail = (response: ServerResponse, status: number, code: string, message: string) => send(response, status, { error: { code, message } })

/** Only the daemon's own origin may talk to it: blocks DNS rebinding and cross-site reads. */
function isTrustedRequest(request: IncomingMessage, port: number): boolean {
  const allowed = new Set([`${LOOPBACK}:${port}`, `localhost:${port}`])
  if (!allowed.has(request.headers.host ?? '')) return false
  const origin = request.headers.origin
  return origin === undefined || allowed.has(origin.replace(/^http:\/\//, ''))
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

async function handleApi(service: ContinuumService, url: URL, response: ServerResponse, onError?: (error: unknown) => void): Promise<void> {
  if (url.pathname === '/api/health') return send(response, 200, { data: { ok: true, mode: 'local' } })
  for (const [pattern, handler] of ROUTES) {
    const match = pattern.exec(url.pathname)
    if (!match) continue
    const params: Record<string, string> = {}
    for (const [key, raw] of Object.entries(match.groups ?? {})) {
      const decoded = safeDecode(raw)
      if (decoded === null) return fail(response, 400, 'bad-request', 'Malformed path.')
      params[key] = decoded
    }
    try {
      return send(response, 200, { data: await handler(service, params, url.searchParams) })
    } catch (error) {
      if (error instanceof NotFoundError) return fail(response, 404, 'not-found', error.message)
      onError?.(error)
      return fail(response, 500, 'internal', 'Continuum could not read this repository. See the terminal running `continuum serve` for details.')
    }
  }
  return fail(response, 404, 'not-found', `No API route ${url.pathname}`)
}

async function fileAt(root: string, pathname: string): Promise<string | null> {
  const decoded = safeDecode(pathname)
  if (decoded === null || decoded.includes('\0')) return null
  const target = resolve(root, `.${decoded}`)
  if (target !== root && !target.startsWith(root + sep)) return null
  try {
    return (await stat(target)).isFile() ? target : null
  } catch {
    return null
  }
}

/** Tells the web app it is served by a daemon, so it reads live data instead of the demo dataset. */
export const DATA_MODE_TAG = '<meta name="continuum-data" content="local">'

function markAsLocal(html: string): string {
  return html.includes('</head>') ? html.replace('</head>', `${DATA_MODE_TAG}</head>`) : `${DATA_MODE_TAG}${html}`
}

async function handleStatic(root: string, url: URL, response: ServerResponse): Promise<void> {
  // Client-side routes fall back to the app shell; real files are served as-is.
  const file = (await fileAt(root, url.pathname)) ?? (extname(url.pathname) === '' ? join(root, 'index.html') : null)
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS })
    response.end('Not found')
    return
  }
  if (extname(file) === '.html') {
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS })
    response.end(markAsLocal(await readFile(file, 'utf8')))
    return
  }
  const isHashedAsset = url.pathname.startsWith('/assets/')
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  })
  createReadStream(file).pipe(response)
}

export function createDaemonServer(options: DaemonOptions, port: () => number): Server {
  const staticRoot = options.staticDir ? resolve(options.staticDir) : null
  return createServer((request, response) => {
    void (async () => {
      if (!isTrustedRequest(request, port())) return fail(response, 403, 'forbidden', 'Requests must come from the Continuum dashboard on this machine.')
      if (request.method !== 'GET' && request.method !== 'HEAD') return fail(response, 405, 'method-not-allowed', 'The local API is read-only.')
      const url = new URL(request.url ?? '/', `http://${LOOPBACK}`)
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(options.service, url, response, options.onError)
      if (!staticRoot) return fail(response, 404, 'not-found', 'The dashboard is not built. Run `npm run build` in the Continuum checkout.')
      return handleStatic(staticRoot, url, response)
    })().catch((error: unknown) => {
      options.onError?.(error)
      if (!response.headersSent) fail(response, 500, 'internal', 'Unexpected error.')
      else response.destroy()
    })
  })
}

export class PortInUseError extends Error {
  constructor(port: number) {
    super(`Port ${port} is already in use. Stop the other process or pass --port <n>.`)
    this.name = 'PortInUseError'
  }
}

/** Starts the daemon on the loopback interface only. */
export function startDaemon(options: DaemonOptions): Promise<RunningDaemon> {
  let boundPort = options.port ?? DEFAULT_PORT
  const server = createDaemonServer(options, () => boundPort)
  return new Promise((resolvePromise, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => reject(error.code === 'EADDRINUSE' ? new PortInUseError(boundPort) : error))
    server.listen(boundPort, LOOPBACK, () => {
      boundPort = (server.address() as AddressInfo).port
      resolvePromise({
        url: `http://${LOOPBACK}:${boundPort}`,
        port: boundPort,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}
