import { useCallback } from 'react'
import { usePreferences } from '../state/preferences'
import { formatDateTime, formatRelative } from '../utils/formatDate'

/** Formats timestamps according to the user's relative/absolute preference. */
export function useTimeFormat(): (iso: string) => string {
  const { preferences } = usePreferences()
  return useCallback((iso: string) => (preferences.relativeTimestamps ? formatRelative(iso) : formatDateTime(iso)), [preferences.relativeTimestamps])
}
