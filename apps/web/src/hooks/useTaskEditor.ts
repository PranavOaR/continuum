import type { TaskChange } from '@continuum/core'
import { continuumService } from '../services'
import { useSave } from './useSave'

export interface TaskEditor {
  /** Resolves true once saved; false when the save failed (already reported to the user). */
  apply: (change: TaskChange) => Promise<boolean>
  isSaving: boolean
}

/** Saves one task edit at a time. */
export function useTaskEditor(projectId: string, taskId: string): TaskEditor {
  const { save, isSaving } = useSave()
  return { apply: async (change) => (await save(() => continuumService.updateTask(projectId, taskId, change))) !== null, isSaving }
}
