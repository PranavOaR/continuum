import { useState } from 'react'
import { useToast } from '../state/toasts'
import { invalidateQueries } from './useServiceQuery'

/** Runs one write at a time, then refreshes every screen. Resolves null when it failed, which it has already reported, never swallowed. */
export function useSave() {
  const notify = useToast()
  const [isSaving, setSaving] = useState(false)
  const save = async <T,>(write: () => Promise<T>): Promise<T | null> => {
    setSaving(true)
    try {
      const saved = await write()
      invalidateQueries()
      return saved
    } catch (error) {
      notify(error instanceof Error ? `Could not save: ${error.message}` : 'Could not save the change.', 'error')
      return null
    } finally {
      setSaving(false)
    }
  }
  return { save, isSaving }
}
