import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { SitePage } from '../components/site/SitePage'

const LAST_UPDATED = '2026-10-19'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-[22px] font-normal tracking-[-0.02em] text-fg">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function PrivacyPage() {
  return (
    <SitePage title="Privacy">
      <article className="mx-auto max-w-[760px] px-4 py-14 text-[15.5px] leading-[1.7] text-muted sm:px-8 md:py-20">
        <p className="label-mono text-subtle">Last updated {LAST_UPDATED}</p>
        <h1 className="mt-4 text-[34px] leading-[1.15] font-normal tracking-display text-fg">Privacy</h1>
        <p className="mt-6">Short version: Continuum keeps your work on your machine, and this website does not track you.</p>

        <Block title="Continuum, the tool">
          <p>
            Everything Continuum records stays in <code className="font-mono text-fg">.continuum/</code> inside your repository. There is no account, and
            Continuum sends nothing to us or to any AI service: your agents keep working exactly as they do now. The dashboard runs on your machine, on
            127.0.0.1 only.
          </p>
          <p>
            Installing it with <code className="font-mono text-fg">npx</code> downloads the package from the npm registry, under npm’s own terms.{' '}
            <Link to="/docs/data" className="text-accent underline decoration-accent/40 underline-offset-4">What gets recorded</Link> lists everything
            Continuum stores, and how to turn each part off or delete it.
          </p>
        </Block>

        <Block title="This website">
          <p>No cookies, no analytics, no tracking scripts. The fonts, images and demo video are served from this site, not from third parties.</p>
          <p>
            The site is hosted on Vercel, which, like any web host, processes standard request data such as IP addresses to deliver the pages. The site
            itself stores nothing in your browser.
          </p>
          <p>The demo video's voiceover was generated with ElevenLabs once, before publishing. Watching it sends nothing to ElevenLabs.</p>
        </Block>

        <Block title="Changes">
          <p>If this changes, for example if the site starts counting visits, this page will say so first, with a new date above.</p>
        </Block>
      </article>
    </SitePage>
  )
}
