import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonClass } from '../components/shared/Button'
import { SitePage } from '../components/site/SitePage'

/** The website's 404, in the site's own design. */
export function SiteNotFoundPage() {
  return (
    <SitePage title="Page not found">
      <div className="relative overflow-hidden">
        <div aria-hidden className="cn-dots cn-dots-fade absolute inset-0 opacity-70" />
        <div className="relative mx-auto max-w-[1160px] px-4 py-28 sm:px-8 md:py-36">
          <p className="label-mono text-accent">404</p>
          <h1 className="mt-4 text-[40px] leading-[1.08] font-normal tracking-display text-fg sm:text-[52px]">
            This page went missing.
            <br />
            <span className="text-muted">Your work doesn’t have to.</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-[17px] leading-[1.6] text-muted">There’s nothing at this address. These are good places to start:</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/" className={buttonClass('primary', 'md', 'h-11 px-5')}>
              Home <ArrowRight aria-hidden />
            </Link>
            <Link to="/docs" className={buttonClass('secondary', 'md', 'h-11 px-5')}>
              Read the docs
            </Link>
          </div>
        </div>
      </div>
    </SitePage>
  )
}
