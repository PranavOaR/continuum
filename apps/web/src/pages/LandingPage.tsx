import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DemoVideo } from '../components/site/DemoVideo'
import { InstallCommand } from '../components/site/InstallCommand'
import { Prose } from '../components/site/Prose'
import { SAMPLE_HANDOFF } from '../components/site/sampleHandoff'
import { AGENT_SETUPS, EVIDENCE_LABELS, INSTALL_COMMAND, LINKS, PACKAGE_NAME, PRIVACY_POINTS, STEPS } from '../components/site/siteContent'
import { buttonClass } from '../components/shared/Button'
import { Logo } from '../components/shared/Logo'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const CONTAINER = 'mx-auto w-full max-w-[1040px] px-4 sm:px-8'

function ExternalLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t border-line py-20">
      <div className={CONTAINER}>
        <h2 id={`${id}-title`} className="text-[26px] leading-[1.2] font-normal tracking-display text-fg sm:text-[30px]">
          {title}
        </h2>
        {lead && <p className="mt-3 max-w-[620px] text-[16px] leading-[1.6] text-muted">{lead}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  )
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <nav aria-label="Main" className={`${CONTAINER} flex h-14 items-center justify-between gap-4`}>
        <Link to="/" aria-label="Continuum home">
          <Logo />
        </Link>
        <div className="flex items-center gap-1 text-[13.5px]">
          <a href="#how-it-works" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-fg sm:block">
            How it works
          </a>
          <ExternalLink href={LINKS.guide} className="hidden rounded-md px-3 py-1.5 text-muted hover:text-fg sm:block">
            Guide
          </ExternalLink>
          <ExternalLink href={LINKS.source} className="rounded-md px-3 py-1.5 text-muted hover:text-fg">
            GitHub
          </ExternalLink>
          <ExternalLink href={LINKS.npm} className={buttonClass('secondary', 'sm', 'ml-1')}>
            npm
          </ExternalLink>
        </div>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section className={`${CONTAINER} pt-16 pb-14 sm:pt-24`}>
      <p className="font-mono text-[12px] text-subtle">v0.1.0 · MIT licensed · runs on your machine</p>
      <h1 className="mt-5 text-[40px] leading-[1.06] font-normal tracking-display text-fg sm:text-[56px]">
        Your work continues.
        <br />
        <span className="text-muted">Your agents change.</span>
      </h1>
      <p className="mt-6 max-w-[600px] text-[17px] leading-[1.6] text-muted">
        Continuum is local project memory for AI coding agents. Every Claude Code, Codex or Cursor session starts knowing where the last one left off: the
        task and its next step, what changed, and which test results still hold.
      </p>
      <div className="mt-8">
        <InstallCommand command={INSTALL_COMMAND} />
        <p className="mt-3 text-[13px] text-subtle">
          Needs Node.js 22.13+ and git. For other agents, run <code className="font-mono text-muted">setup codex</code> or{' '}
          <code className="font-mono text-muted">setup cursor</code>.
        </p>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <Section id="how-it-works" title="How it works">
      <ol className="grid gap-8 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="font-mono text-[12px] text-subtle">{String(index + 1).padStart(2, '0')}</span>
            <h3 className="mt-2 text-[17px] font-medium tracking-[-0.01em] text-fg">{step.title}</h3>
            <p className="mt-2 text-[14.5px] leading-[1.6] text-muted">
              <Prose text={step.body} />
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Briefing() {
  return (
    <Section
      id="briefing"
      title="What the next agent is told"
      lead="The briefing Codex received in the video, as Continuum wrote it. Every claim carries a label saying how Continuum knows it."
    >
      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr]">
        <pre className="max-h-[440px] overflow-auto rounded-lg border border-line bg-surface p-5 font-mono text-[12.5px] leading-[1.65] whitespace-pre-wrap text-fg">
          {SAMPLE_HANDOFF}
        </pre>
        <dl className="space-y-5">
          {EVIDENCE_LABELS.map((item) => (
            <div key={item.label}>
              <dt className="font-mono text-[13px] text-accent">[{item.label}]</dt>
              <dd className="mt-1 text-[14.5px] leading-[1.55] text-muted">{item.meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  )
}

function Agents() {
  return (
    <Section id="agents" title="Works with your agents" lead="One command per agent, per repository. Nothing is written to your global agent settings.">
      <ul className="divide-y divide-line border-y border-line">
        {AGENT_SETUPS.map((agent) => (
          <li key={agent.name} className="grid gap-1 py-4 sm:grid-cols-[160px_240px_1fr] sm:items-baseline sm:gap-6">
            <span className="text-[15px] font-medium text-fg">{agent.name}</span>
            <code className="font-mono text-[13px] text-muted">continuum {agent.command}</code>
            <span className="text-[14px] text-muted">{agent.detail}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Privacy() {
  return (
    <Section id="privacy" title="Stays on your machine">
      <ul className="grid gap-6 md:grid-cols-3">
        {PRIVACY_POINTS.map((point) => (
          <li key={point} className="text-[14.5px] leading-[1.6] text-muted">
            <Prose text={point} />
          </li>
        ))}
      </ul>
    </Section>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className={`${CONTAINER} flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between`}>
        <Logo />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
          <ExternalLink href={LINKS.guide} className="hover:text-fg">Getting started</ExternalLink>
          <ExternalLink href={LINKS.changelog} className="hover:text-fg">Changelog</ExternalLink>
          <ExternalLink href={LINKS.source} className="hover:text-fg">GitHub</ExternalLink>
          <ExternalLink href={LINKS.npm} className="hover:text-fg">{PACKAGE_NAME}</ExternalLink>
        </nav>
        <p className="text-[12px] text-subtle">MIT licensed</p>
      </div>
    </footer>
  )
}

export function LandingPage() {
  useDocumentTitle('')
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main>
        <Hero />
        <div className={`${CONTAINER} pb-20`}>
          <DemoVideo />
        </div>
        <HowItWorks />
        <Briefing />
        <Agents />
        <Privacy />
      </main>
      <SiteFooter />
    </div>
  )
}
