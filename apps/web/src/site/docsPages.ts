import agents from './docs/agents.md?raw'
import commands from './docs/commands.md?raw'
import data from './docs/data.md?raw'
import gettingStarted from './docs/getting-started.md?raw'

/** The docs, in sidebar order. The Markdown files are part of the site, never visitor input. */
export const DOCS_PAGES = [
  { slug: '', title: 'Getting started', markdown: gettingStarted },
  { slug: 'agents', title: 'Agents', markdown: agents },
  { slug: 'commands', title: 'Commands', markdown: commands },
  { slug: 'data', title: 'What gets recorded', markdown: data },
] as const

export const docsPath = (slug: string) => (slug ? `/docs/${slug}` : '/docs')
