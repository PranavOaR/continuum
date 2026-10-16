import { getAgent } from '@continuum/core'
import type { GraphEdge, GraphNode, MemoryGraph, MemoryKind } from '@continuum/core'
import type { ProjectWorkspace } from '@continuum/core'

const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  decision: 'Architecture decision',
  'known-issue': 'Known issue',
  'previous-attempt': 'Previous attempt',
  'next-action': 'Next action',
}

export function symbolNodeId(fileId: string, symbolName: string): string {
  return `symbol:${fileId}:${symbolName}`
}

/**
 * Derives a relationship graph from a project workspace. Nothing is stored
 * separately, so the graph can never contradict the underlying records.
 */
export function buildMemoryGraph(workspace: ProjectWorkspace): MemoryGraph {
  const { project, tasks, files, verification, memory, sessions } = workspace
  const projectHref = `/app/projects/${project.id}`
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const addEdge = (from: string, to: string, label: string) => edges.push({ id: `${from}->${to}`, from, to, label })

  nodes.push({
    id: project.id,
    type: 'project',
    label: project.name,
    subtitle: project.branch,
    description: project.description,
    source: `Repository ${project.repositoryName}`,
    evidenceType: 'observed',
    updatedAt: project.updatedAt,
    href: projectHref,
  })

  for (const task of tasks) {
    nodes.push({
      id: task.id,
      type: 'task',
      label: task.title,
      subtitle: task.status.replace('-', ' '),
      description: task.description,
      source: 'Task record',
      evidenceType: 'observed',
      updatedAt: task.updatedAt,
      href: `${projectHref}?task=${task.id}`,
    })
    addEdge(project.id, task.id, 'has task')
    for (const verificationId of task.verificationIds) addEdge(task.id, verificationId, 'verified by')
    for (const fileId of task.relatedFileIds) addEdge(task.id, fileId, 'touches')
  }

  for (const session of sessions) {
    nodes.push({
      id: session.id,
      type: 'session',
      label: `${getAgent(session.agent).name} session`,
      subtitle: getAgent(session.agent).name,
      description: session.summary,
      source: 'Agent session record',
      evidenceType: session.evidenceType,
      updatedAt: session.endedAt,
    })
    if (session.taskId) addEdge(session.id, session.taskId, 'worked on')
  }

  for (const record of verification) {
    nodes.push({
      id: record.id,
      type: 'verification',
      label: record.name,
      subtitle: record.status.replace(/-/g, ' '),
      description: record.detail,
      source: record.command,
      evidenceType: record.evidenceType,
      updatedAt: record.lastRunAt ?? project.updatedAt,
      href: `${projectHref}#verification`,
    })
  }

  for (const record of memory.filter((entry) => entry.kind !== 'next-action')) {
    nodes.push({
      id: record.id,
      type: 'decision',
      label: record.title,
      subtitle: MEMORY_KIND_LABEL[record.kind],
      description: record.body,
      source: record.sourceDetail,
      evidenceType: record.evidenceType,
      updatedAt: record.createdAt,
      href: `${projectHref}#memory`,
    })
    if (record.taskId) addEdge(record.id, record.taskId, 'informs')
  }

  for (const file of files) {
    nodes.push({
      id: file.id,
      type: 'file',
      label: file.path,
      subtitle: file.changeType,
      description: file.summary,
      source: file.revision ? `Observed at ${file.revision}` : 'Observed change',
      evidenceType: file.evidenceType,
      updatedAt: file.updatedAt,
      href: `${projectHref}?task=${file.taskId ?? ''}&file=${file.id}`,
    })
    for (const decisionId of file.decisionIds) addEdge(decisionId, file.id, 'constrains')
    for (const symbol of file.symbols) {
      const id = symbolNodeId(file.id, symbol.name)
      nodes.push({
        id,
        type: 'symbol',
        label: symbol.name,
        subtitle: symbol.kind,
        description: `${symbol.kind} defined in ${file.path}.`,
        source: `Symbol in ${file.path}`,
        evidenceType: file.evidenceType,
        updatedAt: file.updatedAt,
      })
      addEdge(file.id, id, 'defines')
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id))
  return {
    projectId: project.id,
    nodes,
    edges: edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)),
  }
}
