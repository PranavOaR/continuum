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
  listActivityPage: async (projectId, query) => (await active()).listActivityPage(projectId, query),
  getMemoryGraph: async (projectId) => (await active()).getMemoryGraph(projectId),
  search: async (query) => (await active()).search(query),
  getBriefing: async (projectId) => (await active()).getBriefing(projectId),
  updateTask: async (projectId, taskId, change) => (await active()).updateTask(projectId, taskId, change),
  createTask: async (projectId, task) => (await active()).createTask(projectId, task),
  addMemory: async (projectId, record) => (await active()).addMemory(projectId, record),
  reviewMemory: async (projectId, memoryId, review) => (await active()).reviewMemory(projectId, memoryId, review),
  getTaskReplay: async (projectId, taskId) => (await active()).getTaskReplay(projectId, taskId),
  getSettings: async (projectId) => (await active()).getSettings(projectId),
  updateSettings: async (projectId, change) => (await active()).updateSettings(projectId, change),
  previewRedaction: async (projectId, patterns, sample) => (await active()).previewRedaction(projectId, patterns, sample),
  getProfile: async () => (await active()).getProfile(),
  updateProfile: async (preferences) => (await active()).updateProfile(preferences),
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
