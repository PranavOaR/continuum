import { useEffect, useState } from 'react'
import { usePreferences } from '../state/preferences'

const QUERY = '(prefers-reduced-motion: reduce)'

/** True when either the OS setting or the in-app "Reduce motion" preference asks for less motion. */
export function useReducedMotion(): boolean {
  const { preferences } = usePreferences()
  const [isSystemReduced, setSystemReduced] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const update = () => setSystemReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isSystemReduced || preferences.reduceMotion
}
