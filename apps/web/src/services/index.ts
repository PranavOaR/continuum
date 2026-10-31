import type { ContinuumService } from '@continuum/core'
import { dataMode } from './dataMode'
import { createHttpContinuumService } from './httpContinuumService'

const httpService = createHttpContinuumService()

/** The sample dataset loads only when it is shown, so the dashboard `continuum serve` ships never downloads it. */
async function active(): Promise<ContinuumService> {
  if (dataMode() === 'local') return httpService
  return (await import('./mockContinuumService')).mockContinuumService
}

/** Live data from `continuum serve` when available, the demo dataset otherwise. */
export const continuumService: ContinuumService = {
  getOverview: async () => (await active()).getOverview(),
  listProjects: async () => (await active()).listProjects(),
  listTasks: async () => (await active()).listTasks(),
  getWorkspace: async (projectId) => (await active()).getWorkspace(projectId),
  listActivity: async () => (await active()).listActivity(),
  getMemoryGraph: async (projectId) => (await active()).getMemoryGraph(projectId),
  search: async (query) => (await active()).search(query),
  getBriefing: async (projectId) => (await active()).getBriefing(projectId),
  updateTask: async (projectId, taskId, change) => (await active()).updateTask(projectId, taskId, change),
}

export { dataMode, type DataMode } from './dataMode'
export { NotFoundError } from '@continuum/core'
export type {
  AttentionItem,
  AttentionKind,
  ContinuumService,
  OverviewData,
  ProjectSummary,
  ProjectWorkspace,
  SearchResult,
  SearchResultKind,
} from '@continuum/core'
