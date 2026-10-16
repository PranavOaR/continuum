import type { ContinuumService } from '@continuum/core'
import { dataMode } from './dataMode'
import { createHttpContinuumService } from './httpContinuumService'
import { mockContinuumService } from './mockContinuumService'

const httpService = createHttpContinuumService()

async function active(): Promise<ContinuumService> {
  return (await dataMode()) === 'local' ? httpService : mockContinuumService
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
