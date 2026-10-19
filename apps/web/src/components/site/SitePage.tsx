import type { ReactNode } from 'react'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

/** A website page other than the home page: the site's header and footer around its content. */
export function SitePage({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title)
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
