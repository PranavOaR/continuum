import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream'
import { NotFoundError, type ContinuumService, type TaskChange } from '@continuum/core'
import { InvalidTaskChangeError } from '@continuum/context'
import type { ChangeFeed } from './changeFeed'
import { ProjectUnavailableError } from './localService'

export const LOOPBACK = '127.0.0.1'
export const DEFAULT_PORT = 4747
const MAX_QUERY_CHARS = 200
const TOKEN_BYTES = 24
const TOKEN_PARAM = 'token'
const EVENTS_PATH = '/api/events'
/** Header carrying the per-run CSRF token on writes from the dashboard. */
export const CSRF_HEADER = 'x-continuum-csrf'
/** Task edits are a few hundred bytes; anything bigger is refused unread. */
const MAX_BODY_BYTES = 16 * 1024
const TASK_ROUTE = /^\/api\/projects\/(?<project>[^/]+)\/tasks\/(?<task>[^/]+)$/
/** A comment line now and then keeps idle connections (and proxies) from timing out. */
const HEARTBEAT_MS = 25_000

/** A fresh secret per `continuum serve`: other users and processes on this machine cannot read the dashboard without it. */
export function createAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

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
  /** Required on every request: as a cookie set from the launch link, or as a bearer token. */
  token: string
  /** Required on writes made with the cookie, in the x-continuum-csrf header; the page receives it in a meta tag. */
  csrfToken?: string
  /** Built web app to serve; without it only the API is available. */
  staticDir?: string
  port?: number
  onError?: (error: unknown) => void
  /** Pushes "something was recorded" to open dashboards; without it they refresh on a timer. */
  changes?: ChangeFeed
}

export interface RunningDaemon {
  url: string
  /** The link to open: it carries the access token once, then a cookie takes over. */
  launchUrl: string
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
  if (!allowed.has((request.headers.host ?? '').toLowerCase())) return false
  const origin = request.headers.origin
  return origin === undefined || allowed.has(origin.toLowerCase().replace(/^http:\/\//, ''))
}

const cookieName = (port: number) => `continuum_${port}`

function sameSecret(candidate: string | undefined, token: string): boolean {
  if (!candidate) return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

function cookie(request: IncomingMessage, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return undefined
}

/** `cookie` is an ambient credential a browser attaches by itself, so writes made with it also need the CSRF token. */
type Access = 'cookie' | 'bearer' | 'denied' | 'redirected'

/**
 * Checks the access token. The launch link's ?token= is exchanged for an
 * HttpOnly, SameSite=Strict cookie and stripped from the address bar.
 */
function authorize(request: IncomingMessage, response: ServerResponse, url: URL, token: string, port: number): Access {
  // A token in the address bar is always swapped for the cookie and stripped, even when already signed in.
  if (!sameSecret(url.searchParams.get(TOKEN_PARAM) ?? undefined, token)) {
    const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1]
    if (sameSecret(bearer, token)) return 'bearer'
    return sameSecret(cookie(request, cookieName(port)), token) ? 'cookie' : 'denied'
  }
  url.searchParams.delete(TOKEN_PARAM)
  response.writeHead(302, {
    Location: `${url.pathname}${url.search}`,
    'Set-Cookie': `${cookieName(port)}=${token}; HttpOnly; SameSite=Strict; Path=/`,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  })
  response.end()
  return 'redirected'
}

function deny(response: ServerResponse, isApi: boolean): void {
  if (isApi) return fail(response, 401, 'unauthorized', 'Open the dashboard through the link printed by `continuum serve`.')
  response.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS })
  response.end('Open the dashboard through the link printed by `continuum serve`; it carries the access token.')
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/** Server-Sent Events: one `change` event naming the projects with new records. */
function handleEvents(request: IncomingMessage, response: ServerResponse, changes: ChangeFeed | undefined): void {
  if (!changes) return fail(response, 404, 'not-found', 'Live updates are not available.')
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', ...SECURITY_HEADERS })
  if (request.method === 'HEAD') return void response.end()
  response.write(': connected\n\n')
  const unsubscribe = changes.subscribe((projectIds) => response.write(`event: change\ndata: ${JSON.stringify({ projectIds })}\n\n`))
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), HEARTBEAT_MS)
  heartbeat.unref()
  response.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
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
      if (error instanceof ProjectUnavailableError) return fail(response, 503, 'unavailable', error.message)
      onError?.(error)
      return fail(response, 500, 'internal', 'Continuum could not read this repository. See the terminal running `continuum serve` for details.')
    }
  }
  return fail(response, 404, 'not-found', `No API route ${url.pathname}`)
}

/** A regular file physically inside the build directory: symlinks pointing outside it are refused. */
async function fileAt(root: string, pathname: string): Promise<string | null> {
  const decoded = safeDecode(pathname)
  if (decoded === null || decoded.includes('\0')) return null
  try {
    const [target, realRoot] = await Promise.all([realpath(resolve(root, `.${decoded}`)), realpath(root)])
    if (!target.startsWith(realRoot + sep)) return null
    return (await stat(target)).isFile() ? target : null
  } catch {
    return null
  }
}

/** Tells the web app it is served by a daemon, so it reads live data instead of the demo dataset. */
export const DATA_MODE_TAG = '<meta name="continuum-data" content="local">'

function markAsLocal(html: string, csrfToken: string): string {
  const tags = `${DATA_MODE_TAG}<meta name="continuum-csrf" content="${csrfToken}">`
  return html.includes('</head>') ? html.replace('</head>', `${tags}</head>`) : `${tags}${html}`
}

class BodyError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new BodyError(415, 'Send JSON.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new BodyError(413, 'Request too large.')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new BodyError(400, 'Malformed JSON.')
  }
}

const TASK_STATUSES = new Set(['planned', 'in-progress', 'blocked', 'completed'])

/** The edit as the API accepts it; anything else is rejected before it reaches the store. */
function parseTaskChange(body: unknown): TaskChange | null {
  if (typeof body !== 'object' || body === null) return null
  const value = body as Record<string, unknown>
  switch (value.kind) {
    case 'status':
      return typeof value.status === 'string' && TASK_STATUSES.has(value.status) ? { kind: 'status', status: value.status as Extract<TaskChange, { kind: 'status' }>['status'] } : null
    case 'next-action':
      return value.nextAction === null || typeof value.nextAction === 'string' ? { kind: 'next-action', nextAction: value.nextAction } : null
    case 'step':
      return typeof value.step === 'string' && typeof value.done === 'boolean' ? { kind: 'step', step: value.step, done: value.done } : null
    case 'criterion':
      return Number.isInteger(value.index) && typeof value.met === 'boolean' ? { kind: 'criterion', index: value.index as number, met: value.met } : null
    default:
      return null
  }
}

/** POST /api/projects/:id/tasks/:taskId with one TaskChange: the dashboard's only write. */
async function handleTaskEdit(service: ContinuumService, url: URL, request: IncomingMessage, response: ServerResponse, onError?: (error: unknown) => void): Promise<void> {
  const match = TASK_ROUTE.exec(url.pathname)
  const projectId = match?.groups ? safeDecode(match.groups.project) : null
  const taskId = match?.groups ? safeDecode(match.groups.task) : null
  if (!projectId || !taskId) return fail(response, 404, 'not-found', `No API route ${url.pathname}`)
  let change: TaskChange | null
  try {
    change = parseTaskChange(await readJsonBody(request))
  } catch (error) {
    if (error instanceof BodyError) return fail(response, error.status, 'bad-request', error.message)
    throw error
  }
  if (!change) return fail(response, 400, 'bad-request', 'Unrecognized task change.')
  try {
    return send(response, 200, { data: await service.updateTask(projectId, taskId, change) })
  } catch (error) {
    if (error instanceof NotFoundError) return fail(response, 404, 'not-found', error.message)
    if (error instanceof InvalidTaskChangeError) return fail(response, 400, 'bad-request', error.message)
    if (error instanceof ProjectUnavailableError) return fail(response, 503, 'unavailable', error.message)
    onError?.(error)
    return fail(response, 500, 'internal', 'Continuum could not record the change. See the terminal running `continuum serve` for details.')
  }
}

async function handleStatic(root: string, url: URL, response: ServerResponse, csrfToken: string): Promise<void> {
  // Client-side routes fall back to the app shell; real files are served as-is.
  const file = (await fileAt(root, url.pathname)) ?? (extname(url.pathname) === '' ? join(root, 'index.html') : null)
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS })
    response.end('Not found')
    return
  }
  if (extname(file) === '.html') {
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS })
    response.end(markAsLocal(await readFile(file, 'utf8'), csrfToken))
    return
  }
  const isHashedAsset = url.pathname.startsWith('/assets/')
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  })
  // pipeline closes the file if the client goes away, and reports a file removed by a rebuild instead of crashing.
  pipeline(createReadStream(file), response, (error) => {
    if (error && !response.headersSent) response.destroy()
  })
}

export function createDaemonServer(options: DaemonOptions, port: () => number): Server {
  const staticRoot = options.staticDir ? resolve(options.staticDir) : null
  const csrfToken = options.csrfToken ?? createAccessToken()
  return createServer((request, response) => {
    void (async () => {
      if (!isTrustedRequest(request, port())) return fail(response, 403, 'forbidden', 'Requests must come from the Continuum dashboard on this machine.')
      const url = new URL(request.url ?? '/', `http://${LOOPBACK}`)
      const isWrite = request.method === 'POST' && TASK_ROUTE.test(url.pathname)
      if (request.method !== 'GET' && request.method !== 'HEAD' && !isWrite) return fail(response, 405, 'method-not-allowed', 'Only task edits can be written; everything else is read-only.')
      const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/')
      const access = authorize(request, response, url, options.token, port())
      if (access === 'redirected') return
      if (access === 'denied') return deny(response, isApi)
      if (isWrite) {
        // A browser write must name its origin (checked above) and carry the page's CSRF token.
        const csrfOk = access === 'bearer' || (request.headers.origin !== undefined && sameSecret(String(request.headers[CSRF_HEADER] ?? ''), csrfToken))
        if (!csrfOk) return fail(response, 403, 'forbidden', 'Edits must come from the dashboard page itself.')
        return handleTaskEdit(options.service, url, request, response, options.onError)
      }
      if (url.pathname === EVENTS_PATH) return handleEvents(request, response, options.changes)
      if (isApi) return handleApi(options.service, url, response, options.onError)
      if (!staticRoot) return fail(response, 404, 'not-found', 'The dashboard is not built. Run `npm run build` in the Continuum checkout.')
      return handleStatic(staticRoot, url, response, csrfToken)
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
        // Straight to the dashboard: the site root is the product's landing page.
        launchUrl: `http://${LOOPBACK}:${boundPort}/app?${TOKEN_PARAM}=${options.token}`,
        port: boundPort,
        close: () =>
          new Promise((done) => {
            // Open event streams would otherwise keep the server from closing.
            options.changes?.close()
            server.closeAllConnections()
            server.close(() => done())
          }),
      })
    })
  })
}
