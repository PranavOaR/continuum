import { continuumService, type ProjectSummary, type ProjectWorkspace } from '../services'
import type { ProjectTask } from '@continuum/core'
import { useServiceQuery, type QueryState } from './useServiceQuery'

export function useWorkspace(projectId: string): QueryState<ProjectWorkspace> {
  return useServiceQuery(`workspace:${projectId}`, () => continuumService.getWorkspace(projectId))
}

export function useProjects(): QueryState<ProjectSummary[]> {
  return useServiceQuery('projects', () => continuumService.listProjects())
}

export function useTasks(): QueryState<ProjectTask[]> {
  return useServiceQuery('tasks', () => continuumService.listTasks())
}
