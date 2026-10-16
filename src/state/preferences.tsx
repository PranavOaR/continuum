import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AGENTS } from '../data/agents'
import { createPersistentStore, isRecord } from '../services/storage'
import type { AgentType, ContextCategory } from '../types'
import { CONTEXT_CATEGORIES, DEFAULT_CONTEXT } from '../utils/labels'

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

const store = createPersistentStore<Preferences>('preferences', DEFAULT_PREFERENCES, isPreferences)

interface PreferencesContextValue {
  preferences: Preferences
  updatePreferences: (changes: Partial<Preferences>) => void
  resetPreferences: () => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function resolveTheme(theme: ThemePreference): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => store.load())

  useEffect(() => {
    const root = document.documentElement
    const apply = () => root.setAttribute('data-theme', resolveTheme(preferences.theme))
    apply()
    root.setAttribute('data-reduce-motion', String(preferences.reduceMotion))
    if (preferences.theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preferences.theme, preferences.reduceMotion])

  const updatePreferences = useCallback((changes: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...changes }
      store.save(next)
      return next
    })
  }, [])

  const resetPreferences = useCallback(() => {
    store.clear()
    setPreferences(DEFAULT_PREFERENCES)
  }, [])

  const value = useMemo(() => ({ preferences, updatePreferences, resetPreferences }), [preferences, updatePreferences, resetPreferences])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider')
  return context
}
