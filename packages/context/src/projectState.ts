import { diffSnapshots, recordedFiles, SCAN_SOURCE, type FileChange, type WorkingTree } from '@continuum/capture'
import {
  anchorStatus,
  checkStatus,
  type AnchorStatus,
  type CheckStatus,
  type ContentHash,
  type CurrentHashes,
  type EvidenceType,
  type IdentityKey,
  type MemoryKind,
} from '@continuum/core'
import { keys, type ContextStore, type GraphNode } from '@continuum/store'
import { currentTaskId, taskSummaries, type TaskSummary } from './tasks'

const FILE_PREFIX = 'file:'
const SYMBOL_PREFIX = 'symbol:'

export interface SessionSummary {
  id: string
  agent: string
  startedAt: string | null
  lastActivityAt: string | null
  ended: boolean
  /** Latest progress note, or the end-of-session summary. Agent-reported. */
  note: string | null
  /** The person's last prompt in this session, when prompt capture is on. */
  prompt: string | null
  filesChanged: { path: string; exists: boolean }[]
}

export interface CheckSummary {
  name: string
  command: string
  status: CheckStatus
  exitCode: number | null
  ranAt: string | null
  /** Paths whose content changed since the check ran. */
  changed: string[]
  /** verified: run by `continuum run`; observed: an agent ran it and Claude Code reported the exit code. */
  evidence: EvidenceType
}

export interface DecisionSummary {
  id: string
  kind: MemoryKind
  title: string
  body: string
  evidence: EvidenceType
  recordedAt: string
  status: AnchorStatus
  changed: string[]
}

export interface ProjectState {
  root: string
  revision: string | null
  generatedAt: string
  files: {
    tracked: number
    unrecorded: FileChange[]
    /** Recorded changes no agent session made, since the latest session began: by hand, or a tool Continuum does not see. */
    outsideSessions: { path: string; changeType: string; at: string }[]
  }
  /** Most recently active first. */
  sessions: SessionSummary[]
  checks: CheckSummary[]
  decisions: DecisionSummary[]
  /** Most recently updated first. */
  tasks: TaskSummary[]
  /** The in-progress or blocked task most recently updated, if any. */
  currentTaskId: string | null
  /** Commits recorded since Continuum started watching, newest first. */
  commits: CommitSummary[]
}

export interface CommitSummary {
  hash: string
  message: string
  files: number
  recordedAt: string
}

/** Recent events searched for commits; older ones are in git history. */
const COMMIT_LOOKBACK_EVENTS = 500
const MAX_COMMITS = 5

function recentCommits(store: ContextStore): CommitSummary[] {
  return store
    .recentEvents(COMMIT_LOOKBACK_EVENTS)
    .flatMap(({ event }) =>
      event.type === 'commit.recorded' && !event.payload.baseline
        ? [{ hash: event.payload.hash, message: event.payload.message, files: event.payload.files.length, recordedAt: event.occurredAt }]
        : [],
    )
    .slice(0, MAX_COMMITS)
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
/** `file:src/a.ts` → `src/a.ts`; `symbol:src/a.ts#login` → `src/a.ts#login`. */
const pathOf = (key: IdentityKey) =>
  key.startsWith(FILE_PREFIX) ? key.slice(FILE_PREFIX.length) : key.startsWith(SYMBOL_PREFIX) ? key.slice(SYMBOL_PREFIX.length) : key

/** Graph hashes with file hashes replaced by the live working tree, so evidence is judged against what is on disk now. */
/**
 * Hashes as they are now: files from the working tree, anchored symbols from
 * their current source (missing means changed), everything else as recorded.
 */
export function liveHashes(store: ContextStore, tree: WorkingTree): CurrentHashes {
  const recorded = [...store.graph.currentHashes()].filter(([key]) => !key.startsWith(FILE_PREFIX) && !key.startsWith(SYMBOL_PREFIX))
  const files = [...tree.files].map(([path, hash]) => [keys.file(path), hash] as const)
  return new Map([...recorded, ...files, ...(tree.symbols ?? [])])
}

function nodesOfKind(store: ContextStore, kind: 'session' | 'check' | 'memory'): GraphNode[] {
  return store.graph
    .keysOfKind(kind)
    .map((key) => store.graph.get(key))
    .filter((node): node is GraphNode => node !== undefined)
}

/**
 * Files whose latest recorded change came from no agent session, made after
 * the latest session started (or after the first scan when there is none).
 * The first scan's import of existing files is never "outside" work.
 */
function outsideSessions(store: ContextStore, sessions: readonly GraphNode[]): ProjectState['files']['outsideSessions'] {
  const baseline = store.firstEvent({ source: SCAN_SOURCE, type: 'file.changed' })?.occurredAt ?? ''
  const latestStart = sessions
    .map((node) => text(node.props.startedAt) ?? '')
    .reduce((latest, startedAt) => (startedAt > latest ? startedAt : latest), '')
  const since = latestStart > baseline ? latestStart : baseline
  return store.graph
    .keysOfKind('file')
    .map((key) => store.graph.get(key) as GraphNode)
    .filter((node) => node.props.changedBy === null && node.updatedAt > since)
    .sort((a, b) => newestFirst(a.updatedAt, b.updatedAt))
    .map((node) => ({ path: pathOf(node.key), changeType: text(node.props.changeType) ?? 'modified', at: node.updatedAt }))
}

function summarizeSession(store: ContextStore, node: GraphNode, tree: WorkingTree): SessionSummary {
  const filesChanged = store.graph
    .neighbors(node.key, { direction: 'out', types: ['modified'] })
    .map(pathOf)
    .sort()
    .map((path) => ({ path, exists: tree.files.has(path) }))
  const startedAt = text(node.props.startedAt)
  return {
    id: node.key.slice('session:'.length),
    agent: text(node.props.agent) ?? 'unknown',
    startedAt,
    lastActivityAt: text(node.props.lastActivityAt) ?? text(node.props.endedAt) ?? startedAt ?? node.updatedAt,
    ended: text(node.props.endedAt) !== null,
    note: text(node.props.lastNote) ?? text(node.props.summary),
    prompt: text(node.props.lastPrompt),
    filesChanged,
  }
}

function summarizeCheck(store: ContextStore, node: GraphNode, current: CurrentHashes): CheckSummary {
  const name = text(node.props.name) ?? node.key.slice('check:'.length)
  const { status, changed } = checkStatus(store.checkRun(name), current)
  return {
    name,
    command: text(node.props.command) ?? name,
    status,
    exitCode: typeof node.props.exitCode === 'number' ? node.props.exitCode : null,
    ranAt: text(node.props.ranAt),
    changed: changed.map(pathOf),
    // Runs recorded before evidence was stored on the node all came from `continuum run`.
    evidence: (text(node.props.evidence) ?? 'verified') as EvidenceType,
  }
}

function summarizeDecision(node: GraphNode, current: CurrentHashes): DecisionSummary {
  const anchors = (node.props.anchors ?? {}) as Record<IdentityKey, ContentHash>
  const { status, changed } = anchorStatus(anchors, current)
  return {
    id: node.key.slice('memory:'.length),
    kind: (text(node.props.kind) ?? 'decision') as MemoryKind,
    title: text(node.props.title) ?? '(untitled)',
    body: text(node.props.body) ?? '',
    evidence: (text(node.props.evidence) ?? 'agent-reported') as EvidenceType,
    recordedAt: node.updatedAt,
    status,
    changed: changed.map(pathOf),
  }
}

const newestFirst = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '')

/** A read-only snapshot of where the project stands, judged against the live working tree. */
export interface ProjectStateOptions {
  /** Leave this session out, e.g. the one being briefed at its start: the state is "what came before it". */
  excludeSessionId?: string
}

export function projectState(store: ContextStore, tree: WorkingTree, now: Date, options: ProjectStateOptions = {}): ProjectState {
  const current = liveHashes(store, tree)
  const sessions = nodesOfKind(store, 'session').filter((node) => node.key !== `session:${options.excludeSessionId}`)
  return {
    root: tree.root,
    revision: tree.revision,
    generatedAt: now.toISOString(),
    files: { tracked: tree.files.size, unrecorded: diffSnapshots(recordedFiles(store), tree.files), outsideSessions: outsideSessions(store, sessions) },
    sessions: sessions
      .map((node) => summarizeSession(store, node, tree))
      .sort((a, b) => newestFirst(a.lastActivityAt, b.lastActivityAt)),
    checks: nodesOfKind(store, 'check')
      .map((node) => summarizeCheck(store, node, current))
      .sort((a, b) => a.name.localeCompare(b.name)),
    decisions: nodesOfKind(store, 'memory')
      .map((node) => summarizeDecision(node, current))
      .sort((a, b) => newestFirst(a.recordedAt, b.recordedAt)),
    tasks: taskSummaries(store),
    currentTaskId: currentTaskId(store, now) ?? null,
    commits: recentCommits(store),
  }
}
