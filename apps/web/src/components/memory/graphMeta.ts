import { Box, FileCode2, FlaskConical, FolderGit2, Landmark, ListChecks, Terminal, type LucideIcon } from 'lucide-react'
import type { GraphNodeType } from '@continuum/core'

export const NODE_TYPE_META: Record<GraphNodeType, { label: string; plural: string; icon: LucideIcon; stroke: string; text: string }> = {
  project: { label: 'Project', plural: 'Projects', icon: FolderGit2, stroke: 'stroke-accent', text: 'text-accent' },
  session: { label: 'Agent session', plural: 'Sessions', icon: Terminal, stroke: 'stroke-muted', text: 'text-muted' },
  task: { label: 'Task', plural: 'Tasks', icon: ListChecks, stroke: 'stroke-fg', text: 'text-fg' },
  decision: { label: 'Decision', plural: 'Decisions', icon: Landmark, stroke: 'stroke-warning', text: 'text-warning' },
  verification: { label: 'Verification', plural: 'Verification', icon: FlaskConical, stroke: 'stroke-success', text: 'text-success' },
  file: { label: 'File', plural: 'Files', icon: FileCode2, stroke: 'stroke-line-strong', text: 'text-muted' },
  symbol: { label: 'Symbol', plural: 'Symbols', icon: Box, stroke: 'stroke-subtle', text: 'text-subtle' },
}

export type NodeFilter = 'all' | 'decision' | 'task' | 'file' | 'session' | 'verification'

export const NODE_FILTERS: readonly { id: NodeFilter; label: string; types: GraphNodeType[] }[] = [
  { id: 'all', label: 'All records', types: ['project', 'session', 'task', 'decision', 'verification', 'file', 'symbol'] },
  { id: 'decision', label: 'Decisions', types: ['decision'] },
  { id: 'task', label: 'Tasks', types: ['task'] },
  { id: 'file', label: 'Files & symbols', types: ['file', 'symbol'] },
  { id: 'session', label: 'Sessions', types: ['session'] },
  { id: 'verification', label: 'Verification records', types: ['verification'] },
]
