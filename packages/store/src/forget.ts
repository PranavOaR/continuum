import type { ContinuumEvent, IdentityKey } from '@continuum/core'
import type { HistoryRewrite } from './checkpoint'
import type { GraphNode } from './graphIndex'

/** Replaces forgotten text inside notes, prompts, output and messages. */
export const FORGOTTEN = '[forgotten]'

/** Keys whose values are identifiers or hashes, never free text: they are removed or kept whole, not scrubbed. */
const STRUCTURAL_KEYS = new Set(['path', 'contentHash', 'sessionId', 'taskId', 'id', 'hash', 'coverage', 'lastRunHash', 'recordHash', 'changedBy', 'files', 'ranAgainst', 'anchors'])

/** Replaces `needle` in every free-text string of a value, leaving identifiers and hashes alone. */
function scrub<T>(value: T, needle: string): T {
  if (typeof value === 'string') return value.split(needle).join(FORGOTTEN) as T
  if (Array.isArray(value)) return value.map((item) => scrub(item, needle)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, STRUCTURAL_KEYS.has(key) ? item : scrub(item, needle)])) as T
  }
  return value
}

function withoutKeys<T>(record: Readonly<Record<string, T>> | undefined, drop: (key: string) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => !drop(key)))
}

/** A file, or every file under a directory. */
function pathMatcher(path: string): (candidate: string) => boolean {
  const exact = path.replace(/\/+$/, '')
  return (candidate) => candidate === exact || candidate.startsWith(`${exact}/`)
}

/** Forget a file or directory: its changes, its place in checks, decisions and commits, and its name in any text. */
export function forgetPath(path: string): HistoryRewrite {
  const matches = pathMatcher(path)
  const isFileKey = (key: IdentityKey) => key.startsWith('file:') && matches(key.slice('file:'.length))
  const needle = path.replace(/\/+$/, '')
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
      const nodes = state.nodes.filter((node) => !isFileKey(node.key)).map((node) => scrubNode(pruneNode(node, isFileKey), needle))
      return { nodes, edges: state.edges.filter((edge) => !isFileKey(edge.from) && !isFileKey(edge.to)) }
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

const scrubNode = (node: GraphNode, needle: string): GraphNode => ({ ...node, props: scrub(node.props, needle) })

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
        nodes: state.nodes.map((node) =>
          node.kind === 'session' && node.updatedAt < cutoff ? { ...node, props: withoutKeys(node.props, (key) => (TEXT_PROPS as readonly string[]).includes(key)) } : node,
        ),
      }
    },
  }
}
