import type { ContentHash, IdentityKey } from '@continuum/core'
import { kindOf, type NodeKind } from './keys'

export const EDGE_TYPES = ['touches', 'defines', 'worked_on', 'modified', 'ran_against', 'anchored_to', 'informs', 'part_of'] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

export interface GraphNode {
  key: IdentityKey
  kind: NodeKind
  /** Current content hash; null when the underlying content no longer exists. */
  hash: ContentHash | null
  /** Every distinct hash this identity has had, oldest first. */
  history: ContentHash[]
  props: Record<string, unknown>
  updatedAt: string
}

export interface Edge {
  type: EdgeType
  from: IdentityKey
  to: IdentityKey
}

export type Direction = 'out' | 'in' | 'both'

interface Entry {
  node: GraphNode
  out: Map<string, Edge>
  in: Map<string, Edge>
}

export interface UpsertInput {
  hash: ContentHash | null
  props?: Record<string, unknown>
  at: string
}

const edgeId = (type: EdgeType, other: IdentityKey) => `${type}\u0000${other}`

/**
 * The identity hash map: identity key → graph node with its adjacency lists.
 * Lookups are O(1); traversal follows the adjacency stored in each value.
 */
export class GraphIndex {
  private readonly entries = new Map<IdentityKey, Entry>()

  get size(): number {
    return this.entries.size
  }

  get(key: IdentityKey): GraphNode | undefined {
    return this.entries.get(key)?.node
  }

  has(key: IdentityKey): boolean {
    return this.entries.has(key)
  }

  upsert(key: IdentityKey, input: UpsertInput): { created: boolean; hashChanged: boolean } {
    const existing = this.entries.get(key)
    if (!existing) {
      const node: GraphNode = {
        key,
        kind: kindOf(key),
        hash: input.hash,
        history: input.hash ? [input.hash] : [],
        props: { ...input.props },
        updatedAt: input.at,
      }
      this.entries.set(key, { node, out: new Map(), in: new Map() })
      return { created: true, hashChanged: true }
    }
    const hashChanged = existing.node.hash !== input.hash
    existing.node = {
      ...existing.node,
      hash: input.hash,
      history: hashChanged && input.hash && !existing.node.history.includes(input.hash) ? [...existing.node.history, input.hash] : existing.node.history,
      props: { ...existing.node.props, ...input.props },
      updatedAt: input.at,
    }
    return { created: false, hashChanged }
  }

  /** Restores a node exactly as persisted (used when loading from disk). */
  restore(node: GraphNode): void {
    this.entries.set(node.key, { node: { ...node, history: [...node.history], props: { ...node.props } }, out: new Map(), in: new Map() })
  }

  /** Adds a typed edge. Returns false when it already existed. */
  link(from: IdentityKey, type: EdgeType, to: IdentityKey): boolean {
    const source = this.require(from)
    const target = this.require(to)
    const id = edgeId(type, to)
    if (source.out.has(id)) return false
    const edge: Edge = { type, from, to }
    source.out.set(id, edge)
    target.in.set(edgeId(type, from), edge)
    return true
  }

  unlink(from: IdentityKey, type: EdgeType, to: IdentityKey): boolean {
    const removed = this.entries.get(from)?.out.delete(edgeId(type, to)) ?? false
    this.entries.get(to)?.in.delete(edgeId(type, from))
    return removed
  }

  remove(key: IdentityKey): void {
    const entry = this.entries.get(key)
    if (!entry) return
    for (const edge of entry.out.values()) this.entries.get(edge.to)?.in.delete(edgeId(edge.type, key))
    for (const edge of entry.in.values()) this.entries.get(edge.from)?.out.delete(edgeId(edge.type, key))
    this.entries.delete(key)
  }

  edges(key: IdentityKey, direction: Direction = 'both', types?: readonly EdgeType[]): Edge[] {
    const entry = this.entries.get(key)
    if (!entry) return []
    const pool = [...(direction !== 'in' ? entry.out.values() : []), ...(direction !== 'out' ? entry.in.values() : [])]
    return types ? pool.filter((edge) => types.includes(edge.type)) : pool
  }

  neighbors(key: IdentityKey, options: { direction?: Direction; types?: readonly EdgeType[] } = {}): IdentityKey[] {
    const result = this.edges(key, options.direction ?? 'both', options.types).map((edge) => (edge.from === key ? edge.to : edge.from))
    return [...new Set(result)]
  }

  /** Breadth-first walk from `start`, returning each reachable node once with its hop distance. */
  traverse(
    start: IdentityKey,
    options: { maxDepth: number; direction?: Direction; types?: readonly EdgeType[]; limit?: number },
  ): { key: IdentityKey; depth: number }[] {
    if (!this.entries.has(start)) return []
    const limit = options.limit ?? Number.POSITIVE_INFINITY
    const visited = new Set([start])
    const result = [{ key: start, depth: 0 }]
    let frontier = [start]
    for (let depth = 1; depth <= options.maxDepth && frontier.length > 0 && result.length < limit; depth++) {
      const next: IdentityKey[] = []
      for (const key of frontier) {
        for (const neighbor of this.neighbors(key, options)) {
          if (visited.has(neighbor)) continue
          visited.add(neighbor)
          next.push(neighbor)
          result.push({ key: neighbor, depth })
          if (result.length >= limit) return result
        }
      }
      frontier = next
    }
    return result
  }

  /** Identity → current hash for every node whose content still exists. */
  currentHashes(): Map<IdentityKey, ContentHash> {
    const hashes = new Map<IdentityKey, ContentHash>()
    for (const [key, { node }] of this.entries) if (node.hash) hashes.set(key, node.hash)
    return hashes
  }

  keysOfKind(kind: NodeKind): IdentityKey[] {
    return [...this.entries.values()].filter((entry) => entry.node.kind === kind).map((entry) => entry.node.key)
  }

  allEdges(): Edge[] {
    return [...this.entries.values()].flatMap((entry) => [...entry.out.values()])
  }

  private require(key: IdentityKey): Entry {
    const entry = this.entries.get(key)
    if (!entry) throw new Error(`Unknown node "${key}"`)
    return entry
  }
}
