import { basename } from 'node:path'
import { currentBranch, openWorkspace, readWorkingTree, type WorkingTree } from '@continuum/capture'
import { liveHashes, projectState, type ProjectState } from '@continuum/context'
import type { ContinuumEvent, CurrentHashes } from '@continuum/core'
import type { GraphNode, ContextStore, Edge } from '@continuum/store'

/** Events shown in feeds; older history stays in the store. */
export const MAX_FEED_EVENTS = 200

/** Everything the dashboard needs from one repository, read in one pass and detached from the database. */
export interface RepoSnapshot {
  projectId: string
  root: string
  name: string
  branch: string | null
  state: ProjectState
  tree: WorkingTree
  current: CurrentHashes
  /** When the first scan recorded the existing files; those baseline events are not "work". */
  baselineAt: string | null
  events: { seq: number; event: ContinuumEvent }[]
  nodes: GraphNode[]
  edges: Edge[]
  /** Hash each check recorded per file, keyed by check name. */
  checkCoverage: Map<string, Readonly<Record<string, string>>>
  /** Indexes so mapping stays linear in the size of the graph. */
  nodeByKey: ReadonlyMap<string, GraphNode>
  /** File key → keys of sessions that modified it. */
  modifiedBy: ReadonlyMap<string, readonly string[]>
  /** File key → ids of memories anchored to it. */
  anchoredBy: ReadonlyMap<string, readonly string[]>
}

function groupEdges(edges: readonly Edge[], type: Edge['type'], valueOf: (edge: Edge) => string): Map<string, string[]> {
  const grouped = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.type !== type) continue
    grouped.set(edge.to, [...(grouped.get(edge.to) ?? []), valueOf(edge)])
  }
  return grouped
}

/** When the first scan imported the existing files, even if other events were recorded before it. */
function firstScanTime(store: ContextStore): string | null {
  return store.firstEvent({ source: 'watcher:git', type: 'file.changed' })?.occurredAt ?? null
}

function snapshotGraph(store: ContextStore): Pick<RepoSnapshot, 'nodes' | 'edges' | 'checkCoverage' | 'nodeByKey' | 'modifiedBy' | 'anchoredBy'> {
  const nodes = (['session', 'file', 'check', 'memory', 'task'] as const).flatMap((kind) =>
    store.graph.keysOfKind(kind).map((key) => store.graph.get(key) as GraphNode),
  )
  const checkCoverage = new Map(
    store.graph
      .keysOfKind('check')
      .map((key) => key.slice('check:'.length))
      .map((name) => [name, store.checkRun(name)?.ranAgainst ?? {}] as const),
  )
  const edges = store.graph.allEdges()
  return {
    nodes,
    edges,
    checkCoverage,
    nodeByKey: new Map(nodes.map((node) => [node.key, node])),
    modifiedBy: groupEdges(edges, 'modified', (edge) => edge.from),
    anchoredBy: groupEdges(edges, 'anchored_to', (edge) => edge.from.slice('memory:'.length)),
  }
}

export async function loadSnapshot(projectId: string, cwd: string, now: Date): Promise<RepoSnapshot> {
  const { workspace, store } = await openWorkspace(cwd)
  try {
    const [tree, branch] = await Promise.all([readWorkingTree(workspace.root), currentBranch(workspace.root)])
    return {
      projectId,
      root: workspace.root,
      name: basename(workspace.root),
      branch,
      tree,
      state: projectState(store, tree, now),
      current: liveHashes(store, tree),
      baselineAt: firstScanTime(store),
      events: store.recentEvents(MAX_FEED_EVENTS),
      ...snapshotGraph(store),
    }
  } finally {
    store.close()
  }
}
