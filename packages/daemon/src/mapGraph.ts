import { getAgent, type GraphEdge, type GraphNode as UiNode, type MemoryGraph } from '@continuum/core'
import type { GraphNode } from '@continuum/store'
import { asAgent, ids, text } from './ids'
import { changedFileNodes } from './mapProject'
import type { RepoSnapshot } from './snapshot'

const EDGE_LABELS: Record<string, string> = {
  modified: 'modified',
  ran_against: 'checked',
  anchored_to: 'anchored to',
  informs: 'informs',
  worked_on: 'worked on',
  touches: 'touches',
  part_of: 'part of',
  defines: 'defines',
}

function toUiNode(snapshot: RepoSnapshot, node: GraphNode): UiNode | null {
  const base = { source: 'Continuum context store', updatedAt: node.updatedAt }
  const name = node.key.slice(node.key.indexOf(':') + 1)
  const projectLink = `/app/projects/${snapshot.projectId}`
  switch (node.kind) {
    case 'session':
      return {
        ...base,
        id: node.key,
        type: 'session',
        label: `${getAgent(asAgent(node.props.agent)).name} session`,
        subtitle: text(node.props.endedAt) ? 'ended' : 'open',
        description: text(node.props.lastNote) ?? text(node.props.summary) ?? 'No note recorded.',
        evidenceType: 'observed',
      }
    case 'file':
      return {
        ...base,
        id: node.key,
        type: 'file',
        label: name,
        subtitle: text(node.props.changeType) ?? 'file',
        description: node.hash ? `Content hash ${node.hash.slice(0, 10)}` : 'Deleted',
        evidenceType: 'observed',
        href: `${projectLink}?file=${encodeURIComponent(ids.file(snapshot.projectId, name))}`,
      }
    case 'check':
      return {
        ...base,
        id: node.key,
        type: 'verification',
        label: name,
        subtitle: snapshot.state.checks.find((check) => check.name === name)?.status ?? 'unknown',
        description: text(node.props.command) ?? name,
        evidenceType: 'verified',
        href: `${projectLink}#verification`,
      }
    case 'memory':
      return {
        ...base,
        id: node.key,
        type: 'decision',
        label: text(node.props.title) ?? name,
        subtitle: text(node.props.kind) ?? 'decision',
        description: text(node.props.body) ?? '',
        evidenceType: 'agent-reported',
      }
    case 'task':
      return {
        ...base,
        id: node.key,
        type: 'task',
        label: text(node.props.title) ?? name,
        subtitle: text(node.props.status) ?? 'task',
        description: text(node.props.objective) ?? '',
        evidenceType: 'agent-reported',
      }
    default:
      return null
  }
}

/** The project's slice of the context graph: sessions, the files they changed, checks and decisions. */
export function toGraph(snapshot: RepoSnapshot): MemoryGraph {
  const changed = new Set(changedFileNodes(snapshot).map((node) => node.key))
  const included = snapshot.nodes.filter((node) => node.kind !== 'file' || changed.has(node.key))
  const nodes = included.map((node) => toUiNode(snapshot, node)).filter((node): node is UiNode => node !== null)
  const present = new Set(nodes.map((node) => node.id))
  const projectNode: UiNode = {
    id: `project:${snapshot.projectId}`,
    type: 'project',
    label: snapshot.name,
    subtitle: snapshot.branch ?? 'detached HEAD',
    description: snapshot.root,
    source: 'git',
    evidenceType: 'observed',
    updatedAt: snapshot.state.generatedAt,
    href: `/app/projects/${snapshot.projectId}`,
  }
  const edges: GraphEdge[] = snapshot.edges
    .filter((edge) => present.has(edge.from) && present.has(edge.to))
    .map((edge) => ({ id: `${edge.from}|${edge.type}|${edge.to}`, from: edge.from, to: edge.to, label: EDGE_LABELS[edge.type] ?? edge.type }))
  const sessionEdges: GraphEdge[] = nodes
    .filter((node) => node.type === 'session')
    .map((node) => ({ id: `${projectNode.id}|session|${node.id}`, from: projectNode.id, to: node.id, label: 'session' }))
  return { projectId: snapshot.projectId, nodes: [projectNode, ...nodes], edges: [...sessionEdges, ...edges] }
}
