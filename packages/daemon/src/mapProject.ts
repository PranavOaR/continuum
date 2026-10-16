import { getAgent, type FileStatus, type Project, type ProjectFile } from '@continuum/core'
import type { GraphNode } from '@continuum/store'
import { asAgent, ids, text } from './ids'
import type { RepoSnapshot } from './snapshot'

const FILE_PREFIX = 'file:'
const STACK_MARKERS: readonly (readonly [RegExp, string])[] = [
  [/^package\.json$/, 'Node.js'],
  [/^tsconfig(\..+)?\.json$/, 'TypeScript'],
  [/^(pyproject\.toml|requirements\.txt|setup\.py)$/, 'Python'],
  [/^go\.mod$/, 'Go'],
  [/^Cargo\.toml$/, 'Rust'],
  [/^Gemfile$/, 'Ruby'],
  [/^(pom\.xml|build\.gradle(\.kts)?)$/, 'Java'],
  [/^vite\.config\.[cm]?[jt]s$/, 'Vite'],
  [/^next\.config\.[cm]?[jt]s$/, 'Next.js'],
]

/** Recognizable technologies from marker files at the repository root. Nothing is guessed beyond them. */
export function detectStack(paths: Iterable<string>): string[] {
  const rootFiles = [...paths].filter((path) => !path.includes('/'))
  return [...new Set(STACK_MARKERS.filter(([pattern]) => rootFiles.some((file) => pattern.test(file))).map(([, label]) => label))]
}

export function toProject(snapshot: RepoSnapshot): Project {
  const latestEvent = snapshot.events[0]?.event.occurredAt
  return {
    id: snapshot.projectId,
    name: snapshot.name,
    description: `Local repository at ${snapshot.root}`,
    repositoryName: snapshot.name,
    branch: snapshot.branch ?? 'detached HEAD',
    stack: detectStack(snapshot.tree.files.keys()),
    lastActiveAgent: asAgent(snapshot.state.sessions[0]?.agent),
    ...(snapshot.state.currentTaskId ? { currentTaskId: snapshot.state.currentTaskId } : {}),
    updatedAt: latestEvent ?? snapshot.state.generatedAt,
  }
}

/** Most changed files a response lists; counts still include every one. */
export const MAX_LISTED_FILES = 500

function sessionsThatModified(snapshot: RepoSnapshot, key: string): GraphNode[] {
  return (snapshot.modifiedBy.get(key) ?? []).map((sessionKey) => snapshot.nodeByKey.get(sessionKey)).filter((node): node is GraphNode => node !== undefined)
}

const changedCache = new WeakMap<RepoSnapshot, GraphNode[]>()

/** Every file changed after the first scan, newest first: the baseline import of existing files is not "work". */
export function allChangedFileNodes(snapshot: RepoSnapshot): GraphNode[] {
  const cached = changedCache.get(snapshot)
  if (cached) return cached
  const changed = snapshot.nodes
    .filter((node) => node.kind === 'file' && (node.updatedAt !== snapshot.baselineAt || snapshot.modifiedBy.has(node.key)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  changedCache.set(snapshot, changed)
  return changed
}

/** The newest changed files, bounded so very busy repositories still respond quickly. */
export function changedFileNodes(snapshot: RepoSnapshot): GraphNode[] {
  return allChangedFileNodes(snapshot).slice(0, MAX_LISTED_FILES)
}

function passingChecksCovering(snapshot: RepoSnapshot, key: string, hash: string | undefined): string[] {
  if (!hash) return []
  return snapshot.state.checks
    .filter((check) => check.status === 'passed' && snapshot.checkCoverage.get(check.name)?.[key] === hash)
    .map((check) => check.name)
}

function fileStatus(isVerified: boolean, sessions: GraphNode[]): FileStatus {
  if (isVerified) return 'verified'
  return sessions.some((session) => !text(session.props.endedAt)) ? 'work-in-progress' : 'needs-verification'
}

export function toFile(snapshot: RepoSnapshot, node: GraphNode): ProjectFile {
  const path = node.key.slice(FILE_PREFIX.length)
  const sessions = sessionsThatModified(snapshot, node.key)
  const verifiedBy = passingChecksCovering(snapshot, node.key, snapshot.current.get(node.key))
  const decisions = snapshot.anchoredBy.get(node.key) ?? []
  const changeType = (text(node.props.changeType) ?? 'modified') as ProjectFile['changeType']
  const agents = [...new Set(sessions.map((session) => getAgent(asAgent(session.props.agent)).name))]
  const relevance = [
    verifiedBy.length > 0 ? `Covered by passing check ${verifiedBy.join(', ')} at its current content.` : '',
    decisions.length > 0 ? `${decisions.length} recorded decision${decisions.length === 1 ? '' : 's'} anchored here.` : '',
  ].filter(Boolean)
  return {
    id: ids.file(snapshot.projectId, path),
    projectId: snapshot.projectId,
    path,
    changeType,
    status: fileStatus(verifiedBy.length > 0, sessions),
    evidenceType: verifiedBy.length > 0 ? 'verified' : 'observed',
    ...(text(node.props.revision) ? { revision: text(node.props.revision) as string } : {}),
    summary: agents.length > 0 ? `${capitalize(changeType)} by ${agents.join(' and ')}.` : `${capitalize(changeType)}; captured from the working tree.`,
    relevance: relevance.join(' ') || 'Not yet covered by a recorded check.',
    symbols: [],
    decisionIds: decisions.map((id) => ids.memory(snapshot.projectId, id)),
    // Line counts and diffs are not captured yet; zero with an empty diff means "not recorded".
    additions: 0,
    deletions: 0,
    diff: [],
    updatedAt: node.updatedAt,
  }
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

const filesCache = new WeakMap<RepoSnapshot, ProjectFile[]>()

export function toFiles(snapshot: RepoSnapshot): ProjectFile[] {
  const cached = filesCache.get(snapshot)
  if (cached) return cached
  const files = changedFileNodes(snapshot).map((node) => toFile(snapshot, node))
  filesCache.set(snapshot, files)
  return files
}
