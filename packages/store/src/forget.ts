import type { ContinuumEvent, IdentityKey } from '@continuum/core'
import type { HistoryRewrite } from './checkpoint'
import type { GraphNode } from './graphIndex'
import { anchoredPath } from './keys'

/** Replaces forgotten text inside notes, prompts, output and messages. */
export const FORGOTTEN = '[forgotten]'

/** Keys whose values are identifiers or hashes, never free text: they are removed or kept whole, not scrubbed. */
const STRUCTURAL_KEYS = new Set(['path', 'contentHash', 'sessionId', 'taskId', 'id', 'hash', 'coverage', 'lastRunHash', 'recordHash', 'changedBy', 'files', 'ranAgainst', 'anchors'])

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replaces `needle` (ignoring case, as macOS and Windows file systems do) in every free-text string, leaving identifiers and hashes alone. */
function scrubValue<T>(value: T, needle: string): T {
  if (typeof value === 'string') return value.replace(new RegExp(escapeRegExp(needle), 'gi'), FORGOTTEN) as T
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, needle)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, STRUCTURAL_KEYS.has(key) ? item : scrubValue(item, needle)])) as T
  }
  return value
}

function withoutKeys<T>(record: Readonly<Record<string, T>> | undefined, drop: (key: string) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => !drop(key)))
}

/** Shorter paths would scrub text everywhere: `--path a` would mangle every word containing an "a". */
export const MIN_FORGET_PATH_CHARS = 3

export class InvalidForgetPathError extends Error {
  constructor(path: string) {
    super(`"${path}" is not a repository-relative file or directory of at least ${MIN_FORGET_PATH_CHARS} characters (no leading /, no . or ..).`)
    this.name = 'InvalidForgetPathError'
  }
}

/** A repository-relative path without a trailing slash, or an error for values that would forget everything. */
function forgettablePath(path: string, minChars: number): string {
  const trimmed = path.replace(/\/+$/, '')
  const segments = trimmed.split('/')
  if (trimmed.length < minChars || trimmed.startsWith('/') || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new InvalidForgetPathError(path)
  }
  return trimmed
}

/** A file, or every file under a directory; case-insensitive, so a differently cased name is not missed. */
function pathMatcher(exact: string): (candidate: string) => boolean {
  const lower = exact.toLowerCase()
  return (candidate) => {
    const value = candidate.toLowerCase()
    return value === lower || value.startsWith(`${lower}/`)
  }
}

/** Forget a file or directory: its changes, its place in checks, decisions and commits, and its name in any text. */
export function forgetPath(path: string, options: { scrubText?: boolean } = {}): HistoryRewrite {
  // Without text scrubbing (e.g. ignored paths on import) any valid path is safe, however short.
  const scrubText = options.scrubText ?? true
  const needle = forgettablePath(path, scrubText ? MIN_FORGET_PATH_CHARS : 1)
  const scrub = scrubText ? scrubValue : <T>(value: T) => value
  const matches = pathMatcher(needle)
  // Files and the symbols inside them: both name the path.
  const isFileKey = (key: IdentityKey) => {
    const path = anchoredPath(key)
    return path !== null && matches(path)
  }
  return {
    event(event) {
      switch (event.type) {
        case 'file.changed':
          return matches(event.payload.path) ? null : scrub(event, needle)
        case 'check.recorded':
          return scrub({ ...event, payload: { ...event.payload, ranAgainst: withoutKeys(event.payload.ranAgainst, isFileKey) } }, needle)
        case 'memory.recorded':
          return scrub({ ...event, payload: { ...event.payload, anchors: withoutKeys(event.payload.anchors, isFileKey) } }, needle)
        case 'commit.recorded':
          return scrub({ ...event, payload: { ...event.payload, files: event.payload.files.filter((file) => !matches(file)) } }, needle)
        default:
          return scrub(event, needle)
      }
    },
    state(state) {
      // Check names are commands (`cat secrets.env`), so their keys are scrubbed too, along with their edges.
      const renameKey = (key: IdentityKey) => (key.startsWith('check:') ? scrub(key, needle) : key)
      const nodes = state.nodes
        .filter((node) => !isFileKey(node.key))
        .map((node) => {
          const pruned = pruneNode(node, isFileKey)
          return { ...pruned, props: scrub(pruned.props, needle), key: renameKey(node.key) }
        })
      const edges = state.edges.filter((edge) => !isFileKey(edge.from) && !isFileKey(edge.to)).map((edge) => ({ ...edge, from: renameKey(edge.from), to: renameKey(edge.to) }))
      return { nodes, edges }
    },
  }
}

function pruneNode(node: GraphNode, isFileKey: (key: IdentityKey) => boolean): GraphNode {
  if (node.kind === 'memory') return { ...node, props: { ...node.props, anchors: withoutKeys(node.props.anchors as Record<string, unknown>, isFileKey) } }
  if (node.kind === 'check' && node.props.lastRun) {
    const run = node.props.lastRun as { ranAgainst?: Record<string, unknown> }
    return { ...node, props: { ...node.props, lastRun: { ...run, ranAgainst: withoutKeys(run.ranAgainst, isFileKey) } } }
  }
  return node
}


const SESSION_EVENTS = new Set<ContinuumEvent['type']>(['session.started', 'session.progress', 'session.prompted', 'session.task', 'session.ended'])

/** Forget a session: what it said and was asked, and its link to the files it changed (the changes themselves stay, unattributed). */
export function forgetSession(sessionId: string): HistoryRewrite {
  const sessionKey = `session:${sessionId}`
  return {
    event(event) {
      if (SESSION_EVENTS.has(event.type) && (event.payload as { sessionId?: string }).sessionId === sessionId) return null
      if (event.type === 'file.changed' && event.payload.sessionId === sessionId) {
        const { sessionId: _session, ...payload } = event.payload
        return { ...event, payload }
      }
      return event
    },
    state(state) {
      return {
        nodes: state.nodes
          .filter((node) => node.key !== sessionKey)
          .map((node) => (node.kind === 'file' && node.props.changedBy === sessionId ? { ...node, props: { ...node.props, changedBy: null } } : node)),
        edges: state.edges.filter((edge) => edge.from !== sessionKey && edge.to !== sessionKey),
      }
    },
  }
}

/** Free text people and agents wrote: prompts, progress notes, session summaries and check output. */
const TEXT_PROPS = ['lastNote', 'lastPrompt', 'summary'] as const

/** Forget what was said before a date (prompts, notes, summaries, check output). Recorded facts stay. */
export function forgetTextBefore(before: Date): HistoryRewrite {
  const cutoff = before.toISOString()
  return {
    event(event) {
      if (event.occurredAt >= cutoff) return event
      switch (event.type) {
        case 'session.progress':
        case 'session.prompted':
          return null
        case 'session.ended': {
          const { summary: _summary, ...payload } = event.payload
          return { ...event, payload }
        }
        case 'check.recorded': {
          const { outputTail: _output, ...payload } = event.payload
          return { ...event, payload }
        }
        default:
          return event
      }
    },
    state(state) {
      return {
        ...state,
        nodes: state.nodes.map((node) => {
          if (node.updatedAt >= cutoff) return node
          if (node.kind === 'session') return { ...node, props: withoutKeys(node.props, (key) => (TEXT_PROPS as readonly string[]).includes(key)) }
          if (node.kind === 'check' && node.props.lastRun) {
            const { outputTail: _output, ...run } = node.props.lastRun as Record<string, unknown>
            return { ...node, props: { ...node.props, lastRun: run } }
          }
          return node
        }),
      }
    },
  }
}

/** Applies several rewrites in order, in one pass over the history. */
export function composeRewrites(rewrites: readonly HistoryRewrite[]): HistoryRewrite {
  return {
    event: (event) => rewrites.reduce<ContinuumEvent | null>((current, rewrite) => (current ? rewrite.event(current) : null), event),
    state: (state) => rewrites.reduce((current, rewrite) => rewrite.state(current), state),
  }
}

/** Passes every free-text string (notes, prompts, output, messages) through `transform`, e.g. redaction. */
export function rewriteText(transform: (text: string) => string): HistoryRewrite {
  const map = <T>(value: T): T => {
    if (typeof value === 'string') return transform(value) as T
    if (Array.isArray(value)) return value.map(map) as T
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, STRUCTURAL_KEYS.has(key) ? item : map(item)])) as T
    }
    return value
  }
  return {
    event: (event) => ({ ...event, payload: map(event.payload) }) as ContinuumEvent,
    state: (state) => ({ ...state, nodes: state.nodes.map((node) => ({ ...node, props: map(node.props) })) }),
  }
}
