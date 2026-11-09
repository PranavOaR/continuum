import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Opens a page at its top, as a full page load would, so a link at the bottom of one page does not
 * land at the bottom of the next. Every new navigation counts, so a link to the page you are on
 * scrolls back up. Back, forward and reloads keep the place the browser restores, and a link to a
 * section (#…) is left to scroll there.
 */
export function useScrollToTop(): void {
  const { key, hash } = useLocation()
  const navigation = useNavigationType()
  useEffect(() => {
    if (navigation !== 'POP' && !hash) window.scrollTo({ top: 0 })
  }, [key, hash, navigation])
}
