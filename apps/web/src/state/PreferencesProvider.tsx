import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_PREFERENCES, PreferencesContext, preferencesStore, type Preferences, type ThemePreference } from './preferences'

function resolveTheme(theme: ThemePreference): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => preferencesStore.load())

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
      preferencesStore.save(next)
      return next
    })
  }, [])

  const resetPreferences = useCallback(() => {
    preferencesStore.clear()
    setPreferences(DEFAULT_PREFERENCES)
  }, [])

  const value = useMemo(() => ({ preferences, updatePreferences, resetPreferences }), [preferences, updatePreferences, resetPreferences])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
