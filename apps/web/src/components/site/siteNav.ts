/** The website's header navigation: sections of the home page, then the docs. */
export const HOME_SECTIONS = [
  { id: 'product', label: 'Product' },
  { id: 'demo', label: 'Demo' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'features', label: 'Features' },
] as const

export const SPY_IDS = HOME_SECTIONS.map((section) => section.id)

/** A home-page section, as a link from the home page itself or from any other page. */
export const sectionHref = (id: string, isHome: boolean) => (isHome ? `#${id}` : `/#${id}`)
