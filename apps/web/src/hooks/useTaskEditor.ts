import { useState } from 'react'
import type { TaskChange } from '@continuum/core'
import { continuumService } from '../services'
import { useToast } from '../state/toasts'
import { invalidateQueries } from './useServiceQuery'

export interface TaskEditor {
  apply: (change: TaskChange) => Promise<void>
  isSaving: boolean
}

/** Saves one task edit at a time, then refreshes every screen showing the task. Failures are reported, never swallowed. */
export function useTaskEditor(projectId: string, taskId: string): TaskEditor {
  const notify = useToast()
  const [isSaving, setSaving] = useState(false)
  const apply = async (change: TaskChange) => {
    setSaving(true)
    try {
      await continuumService.updateTask(projectId, taskId, change)
      invalidateQueries()
    } catch (error) {
      notify(error instanceof Error ? `Could not save: ${error.message}` : 'Could not save the change.', 'error')
    } finally {
      setSaving(false)
    }
  }
  return { apply, isSaving }
}
