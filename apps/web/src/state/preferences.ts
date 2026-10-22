import { createContext, useContext } from 'react'
import { AGENTS } from '@continuum/core'
import { createPersistentStore, isRecord } from '../services/storage'
import type { AgentType, ContextCategory } from '@continuum/core'
import { CONTEXT_CATEGORIES, DEFAULT_CONTEXT } from '@continuum/core'

export type ThemePreference = 'dark' | 'light' | 'system'

export interface Preferences {
  theme: ThemePreference
  defaultProjectId: string
  relativeTimestamps: boolean
  reduceMotion: boolean
  preferredSourceAgent: AgentType
  preferredTargetAgent: AgentType
  defaultContext: ContextCategory[]
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  defaultProjectId: 'startup-app',
  relativeTimestamps: true,
  reduceMotion: false,
  preferredSourceAgent: 'claude-code',
  preferredTargetAgent: 'codex',
  defaultContext: [...DEFAULT_CONTEXT],
}

const agentIds = new Set<string>(AGENTS.map((agent) => agent.id))
const categoryIds = new Set<string>(CONTEXT_CATEGORIES.map((category) => category.id))

function isPreferences(value: unknown): value is Preferences {
  if (!isRecord(value)) return false
  return (
    (value.theme === 'dark' || value.theme === 'light' || value.theme === 'system') &&
    typeof value.defaultProjectId === 'string' &&
    typeof value.relativeTimestamps === 'boolean' &&
    typeof value.reduceMotion === 'boolean' &&
    typeof value.preferredSourceAgent === 'string' &&
    agentIds.has(value.preferredSourceAgent) &&
    typeof value.preferredTargetAgent === 'string' &&
    agentIds.has(value.preferredTargetAgent) &&
    Array.isArray(value.defaultContext) &&
    value.defaultContext.every((item) => typeof item === 'string' && categoryIds.has(item))
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
