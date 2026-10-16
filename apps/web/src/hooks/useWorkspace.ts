import { continuumService, type ProjectSummary, type ProjectWorkspace } from '../services'
import { usePreferences } from '../state/preferences'
import type { ProjectTask } from '@continuum/core'
import { useServiceQuery, type QueryState } from './useServiceQuery'

/** Loads a project's workspace; an undefined id waits instead of requesting a project that may not exist. */
export function useWorkspace(projectId: string | undefined): QueryState<ProjectWorkspace> {
  return useServiceQuery(projectId ? `workspace:${projectId}` : null, () => continuumService.getWorkspace(projectId as string))
}

export function useProjects(): QueryState<ProjectSummary[]> {
  return useServiceQuery('projects', () => continuumService.listProjects())
}

/**
 * The saved default project if it exists in the current data (demo ids do not
 * exist locally, and vice versa), else the first project; undefined while loading.
 */
export function usePreferredProjectId(): string | undefined {
  const { preferences } = usePreferences()
  const projects = useProjects()
  if (!projects.data) return undefined
  const ids = projects.data.map((summary) => summary.project.id)
  return ids.includes(preferences.defaultProjectId) ? preferences.defaultProjectId : ids[0]
}

export function useTasks(): QueryState<ProjectTask[]> {
  return useServiceQuery('tasks', () => continuumService.listTasks())
}
