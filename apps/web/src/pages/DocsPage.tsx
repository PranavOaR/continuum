import { marked } from 'marked'
import { useMemo, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SitePage } from '../components/site/SitePage'
import { DOCS_PAGES, docsPath } from '../site/docsPages'
import { cn } from '../utils/cn'
import { SiteNotFoundPage } from './SiteNotFoundPage'

/** Styles for the rendered Markdown, in the site's type scale. */
const PROSE = cn(
  'min-w-0 text-[15.5px] leading-[1.7] text-muted',
  '[&_h1]:mb-6 [&_h1]:text-[34px] [&_h1]:leading-[1.15] [&_h1]:font-normal [&_h1]:tracking-display [&_h1]:text-fg',
  '[&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-[22px] [&_h2]:font-normal [&_h2]:tracking-[-0.02em] [&_h2]:text-fg',
  '[&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_strong]:font-medium [&_strong]:text-fg',
  '[&_a]:text-accent [&_a]:underline [&_a]:decoration-accent/40 [&_a]:underline-offset-4 hover:[&_a]:decoration-accent',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-surface-2 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.88em] [&_:not(pre)>code]:text-fg',
  '[&_pre]:my-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-surface [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-[1.65] [&_pre]:text-fg',
  '[&_table]:my-5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-[14px]',
  '[&_th]:border-b [&_th]:border-line [&_th]:py-2 [&_th]:pr-6 [&_th]:text-left [&_th]:font-medium [&_th]:text-fg',
  '[&_td]:border-b [&_td]:border-line [&_td]:py-2.5 [&_td]:pr-6 [&_td]:align-top',
)

export function DocsPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const page = DOCS_PAGES.find((candidate) => candidate.slug === slug)
  // Our own Markdown, rendered once per page; npm links open in a new tab.
  const html = useMemo(() => (page ? (marked.parse(page.markdown, { async: false }) as string).replace(/<a href="https:/g, '<a target="_blank" rel="noreferrer" href="https:') : ''), [page])
  if (!page) return <SiteNotFoundPage />

  // Links between docs pages stay in the app instead of reloading the page.
  const onContentClick = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')
    const href = anchor?.getAttribute('href')
    if (!href?.startsWith('/') || event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    navigate(href)
  }

  return (
    <SitePage title={`${page.title} · Docs`}>
      <div className="mx-auto grid max-w-[1160px] gap-10 px-4 py-14 sm:px-8 md:grid-cols-[200px_minmax(0,1fr)] md:py-20">
        <nav aria-label="Docs" className="min-w-0">
          <p className="mb-3 label-mono text-subtle">Docs</p>
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {DOCS_PAGES.map((candidate) => (
              <li key={candidate.slug} className="shrink-0">
                <Link
                  to={docsPath(candidate.slug)}
                  aria-current={candidate.slug === slug ? 'page' : undefined}
                  className={cn('block rounded-md px-3 py-1.5 text-[14px] whitespace-nowrap', candidate.slug === slug ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg')}
                >
                  {candidate.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className={cn(PROSE, 'max-w-[760px]')} onClick={onContentClick} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </SitePage>
  )
}
