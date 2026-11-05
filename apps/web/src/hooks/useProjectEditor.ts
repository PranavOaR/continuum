import type { MemoryRecord, MemoryReview, NewMemory, NewTask, ProjectTask } from '@continuum/core'
import { continuumService } from '../services'
import { useSave } from './useSave'

export interface ProjectEditor {
  /** Each resolves to what was saved, or null when the save failed (already reported to the user). */
  createTask: (task: NewTask) => Promise<ProjectTask | null>
  addMemory: (record: NewMemory) => Promise<MemoryRecord | null>
  reviewMemory: (memoryId: string, review: MemoryReview) => Promise<MemoryRecord | null>
  isSaving: boolean
}

/** Saves what you add to a project, one write at a time. */
export function useProjectEditor(projectId: string): ProjectEditor {
  const { save, isSaving } = useSave()
  return {
    createTask: (task) => save(() => continuumService.createTask(projectId, task)),
    addMemory: (record) => save(() => continuumService.addMemory(projectId, record)),
    reviewMemory: (memoryId, review) => save(() => continuumService.reviewMemory(projectId, memoryId, review)),
    isSaving,
  }
}
