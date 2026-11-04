import { createContext, useContext } from 'react'
import { createPersistentStore, isRecord } from '../services/storage'

export type ThemePreference = 'dark' | 'light' | 'system'

export interface Preferences {
  theme: ThemePreference
  defaultProjectId: string
  relativeTimestamps: boolean
  reduceMotion: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  defaultProjectId: 'startup-app',
  relativeTimestamps: true,
  reduceMotion: false,
}

function isPreferences(value: unknown): value is Preferences {
  if (!isRecord(value)) return false
  return (
    (value.theme === 'dark' || value.theme === 'light' || value.theme === 'system') &&
    typeof value.defaultProjectId === 'string' &&
    typeof value.relativeTimestamps === 'boolean' &&
    typeof value.reduceMotion === 'boolean'
  )
}

/** Where the preferences persist between visits. */
export const preferencesStore = createPersistentStore<Preferences>('preferences', DEFAULT_PREFERENCES, isPreferences)

export interface PreferencesContextValue {
  preferences: Preferences
  updatePreferences: (changes: Partial<Preferences>) => void
  resetPreferences: () => void
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider')
  return context
}
