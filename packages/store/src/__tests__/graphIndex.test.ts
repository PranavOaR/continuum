import { describe, expect, it } from 'vitest'
import { GraphIndex } from '../graphIndex'

const AT = '2026-10-16T10:00:00.000Z'

function sampleGraph() {
  const graph = new GraphIndex()
  graph.upsert('task:auth', { hash: 'h-task', at: AT })
  graph.upsert('file:src/login.ts', { hash: 'h-login-1', at: AT })
  graph.upsert('file:src/session.ts', { hash: 'h-session-1', at: AT })
  graph.upsert('symbol:src/session.ts#createSession', { hash: 'h-sym', at: AT })
  graph.upsert('memory:session-service', { hash: 'h-mem', at: AT })
  graph.link('task:auth', 'touches', 'file:src/login.ts')
  graph.link('task:auth', 'touches', 'file:src/session.ts')
  graph.link('file:src/session.ts', 'defines', 'symbol:src/session.ts#createSession')
  graph.link('memory:session-service', 'anchored_to', 'symbol:src/session.ts#createSession')
  return graph
}

describe('GraphIndex', () => {
  it('looks nodes up by identity in constant time and records hash history', () => {
    const graph = new GraphIndex()
    expect(graph.upsert('file:a.ts', { hash: 'h1', at: AT })).toEqual({ created: true, hashChanged: true })
    expect(graph.upsert('file:a.ts', { hash: 'h1', at: AT })).toEqual({ created: false, hashChanged: false })
    expect(graph.upsert('file:a.ts', { hash: 'h2', at: AT })).toEqual({ created: false, hashChanged: true })
    expect(graph.get('file:a.ts')).toMatchObject({ kind: 'file', hash: 'h2', history: ['h1', 'h2'] })
  })

  it('merges props without dropping existing ones', () => {
    const graph = new GraphIndex()
    graph.upsert('task:t', { hash: 'h', props: { title: 'A' }, at: AT })
    graph.upsert('task:t', { hash: 'h', props: { status: 'in-progress' }, at: AT })
    expect(graph.get('task:t')?.props).toEqual({ title: 'A', status: 'in-progress' })
  })

  it('stores typed edges in both directions without duplicates', () => {
    const graph = sampleGraph()
    expect(graph.link('task:auth', 'touches', 'file:src/login.ts')).toBe(false)
    expect(graph.neighbors('task:auth', { direction: 'out' })).toEqual(['file:src/login.ts', 'file:src/session.ts'])
    expect(graph.neighbors('symbol:src/session.ts#createSession', { direction: 'in' })).toEqual(['file:src/session.ts', 'memory:session-service'])
    expect(graph.neighbors('symbol:src/session.ts#createSession', { direction: 'in', types: ['anchored_to'] })).toEqual(['memory:session-service'])
  })

  it('refuses edges to unknown nodes', () => {
    const graph = new GraphIndex()
    graph.upsert('task:t', { hash: 'h', at: AT })
    expect(() => graph.link('task:t', 'touches', 'file:missing.ts')).toThrow(/Unknown node/)
  })

  it('unlinks edges and removes nodes with their edges', () => {
    const graph = sampleGraph()
    graph.unlink('task:auth', 'touches', 'file:src/login.ts')
    expect(graph.neighbors('task:auth', { direction: 'out' })).toEqual(['file:src/session.ts'])
    graph.remove('file:src/session.ts')
    expect(graph.get('file:src/session.ts')).toBeUndefined()
    expect(graph.neighbors('task:auth', { direction: 'both' })).toEqual([])
    expect(graph.neighbors('symbol:src/session.ts#createSession', { direction: 'in' })).toEqual(['memory:session-service'])
  })

  it('traverses breadth-first with depth and limit, in either direction', () => {
    const graph = sampleGraph()
    expect(graph.traverse('task:auth', { maxDepth: 3, direction: 'both' })).toEqual([
      { key: 'task:auth', depth: 0 },
      { key: 'file:src/login.ts', depth: 1 },
      { key: 'file:src/session.ts', depth: 1 },
      { key: 'symbol:src/session.ts#createSession', depth: 2 },
      { key: 'memory:session-service', depth: 3 },
    ])
    expect(graph.traverse('task:auth', { maxDepth: 1, direction: 'out' }).map((step) => step.key)).toEqual([
      'task:auth',
      'file:src/login.ts',
      'file:src/session.ts',
    ])
    expect(graph.traverse('task:auth', { maxDepth: 5, direction: 'both', limit: 2 })).toHaveLength(2)
  })

  it('exposes current hashes, omitting deleted content', () => {
    const graph = sampleGraph()
    graph.upsert('file:src/login.ts', { hash: null, at: AT })
    const hashes = graph.currentHashes()
    expect(hashes.get('file:src/session.ts')).toBe('h-session-1')
    expect(hashes.has('file:src/login.ts')).toBe(false)
  })

  it('lists nodes by kind', () => {
    expect(sampleGraph().keysOfKind('file')).toEqual(['file:src/login.ts', 'file:src/session.ts'])
  })
})
