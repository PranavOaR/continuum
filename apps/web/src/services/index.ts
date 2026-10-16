import type { ContinuumService } from '@continuum/core'
import { dataMode } from './dataMode'
import { createHttpContinuumService } from './httpContinuumService'
import { mockContinuumService } from './mockContinuumService'

const httpService = createHttpContinuumService()

function active(): ContinuumService {
  return dataMode() === 'local' ? httpService : mockContinuumService
}

/** Live data from `continuum serve` when available, the demo dataset otherwise. */
export const continuumService: ContinuumService = {
  getOverview: () => active().getOverview(),
  listProjects: () => active().listProjects(),
  listTasks: () => active().listTasks(),
  getWorkspace: (projectId) => active().getWorkspace(projectId),
  listActivity: () => active().listActivity(),
  getMemoryGraph: (projectId) => active().getMemoryGraph(projectId),
  search: (query) => active().search(query),
  getBriefing: (projectId) => active().getBriefing(projectId),
  updateTask: (projectId, taskId, change) => active().updateTask(projectId, taskId, change),
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
