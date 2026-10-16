import { ArrowRightLeft, ArrowUpRight, Brain, Check, Code2, Copy, GitCompareArrows, HardDrive, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FlowDiagram } from '../components/landing/FlowDiagram'
import { HeroPreview } from '../components/landing/HeroPreview'
import { LandingSidebar, type PageSection } from '../components/landing/LandingSidebar'
import { useScrollSpy } from '../components/landing/useScrollSpy'
import { ButtonLink, buttonClass } from '../components/shared/Button'
import { Logo, LogoMark } from '../components/shared/Logo'
import { AGENTS } from '../data/agents'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { copyToClipboard } from '../utils/clipboard'

const SECTIONS: readonly PageSection[] = [
  { id: 'product', label: 'Product' },
  { id: 'problem', label: 'The problem' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'get-started', label: 'Get started' },
]
const SECTION_IDS = SECTIONS.map((section) => section.id)

const SAMPLE_HANDOFF = `# Continuum handoff context
Project: Startup App · Task: Implement Google authentication
From: Claude Code → To: Codex

## Next steps
- Recommended next action: Inspect the current diff, complete callback validation, then run the authentication tests.

> Example generated from mock data.`

const COPY_RESET_MS = 2000

const PROBLEMS = [
  { title: 'Every new session starts blank.', body: 'You re-explain the architecture, the task, and what was already tried.' },
  { title: 'Handoffs are written by hand.', body: 'Summaries come from memory, and drift from what actually changed.' },
  { title: 'Unfinished work is hard to see.', body: 'Which files changed, which tests ran, what was abandoned — it all takes digging.' },
]

const FEATURES: { icon: LucideIcon; title: string; caption: string; body: string }[] = [
  { icon: Brain, title: 'Project-aware memory', caption: 'Decisions · issues · attempts', body: 'Typed records tied to the tasks and files they affect.' },
  { icon: GitCompareArrows, title: 'Change tracking', caption: 'Per session, per file', body: 'See which files each session touched and why they matter.' },
  { icon: ShieldCheck, title: 'Evidence-backed state', caption: 'Observed · verified · inferred', body: 'Every claim is labelled with how Continuum knows it.' },
  { icon: ArrowRightLeft, title: 'Cross-agent handoffs', caption: 'Choose what to include', body: 'A focused context package for whichever agent comes next.' },
  { icon: Code2, title: 'Code-aware retrieval', caption: 'Files · symbols · tests', body: 'Context assembled around what the task actually touches.' },
  { icon: HardDrive, title: 'Local-first', caption: 'No mandatory AI APIs', body: 'Designed to index and retrieve on your own machine.' },
]

function SectionIntro({ eyebrow, title }: { eyebrow: string; title: ReactNode }) {
  return (
    <>
      <p className="mb-4 label-mono text-subtle">{eyebrow}</p>
      <h2 className="mb-4 text-[24px] leading-[1.25] font-normal tracking-[-0.02em] text-fg">{title}</h2>
    </>
  )
}

function CopyExampleBar() {
  const [isCopied, setCopied] = useState(false)
  const copy = async () => {
    const result = await copyToClipboard(SAMPLE_HANDOFF)
    if (!result.ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), COPY_RESET_MS)
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="cn-hatch flex h-8 w-full max-w-[406px] items-center justify-between border border-line px-3 font-mono text-[12px] font-medium tracking-[0.06em] text-fg uppercase hover:border-line-strong"
    >
      <span aria-live="polite">{isCopied ? 'Example copied' : 'Copy an example handoff'}</span>
      {isCopied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5 text-muted" aria-hidden />}
    </button>
  )
}

function Hero() {
  return (
    <section id="product" className="scroll-mt-20 pt-12 lg:pt-16">
      <Link to="/app" className="inline-flex items-stretch border border-line bg-surface-2 text-[13px]">
        <span className="flex items-center gap-2 px-3 py-1.5 text-muted">
          <span aria-hidden className="size-1.5 rounded-full bg-live" />
          Frontend prototype
        </span>
        <span className="flex items-center gap-1.5 border-l border-line bg-surface px-3 py-1.5 font-medium text-fg">
          Explore the demo <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      </Link>

      <h1 className="mt-8 max-w-[600px] text-[34px] leading-[1.12] font-normal tracking-display text-fg sm:text-[40px]">
        Your work continues. Your agents change.
      </h1>
      <p className="mt-5 max-w-[600px] text-[17px] leading-[1.6] text-muted">
        Switch between AI coding agents without losing your project's context, progress, or next steps. Continuum keeps track of what changed, what
        remains unfinished, and what the next agent needs to know.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink to="/app" variant="primary" icon={<LogoMark onWhite className="size-5" />}>
          Explore the demo
        </ButtonLink>
        <a href="#how-it-works" className={buttonClass('secondary', 'md', 'cn-ticks border-accent/25 bg-accent/[0.06] hover:bg-accent/10')}>
          See how it works <ArrowUpRight aria-hidden />
        </a>
      </div>
      <div className="mt-3">
        <CopyExampleBar />
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="label-mono text-subtle">Designed for</p>
        {AGENTS.filter((agent) => agent.id !== 'other').map((agent) => (
          <span key={agent.id} className="font-mono text-[12px] text-muted">
            {agent.name}
          </span>
        ))}
      </div>

      <div className="relative mt-14 overflow-hidden bg-[#0a1c7a] p-4 sm:p-10">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgb(90_140_255/0.35)_1px,transparent_1px)] bg-[size:14px_14px]" />
        <div aria-hidden className="absolute -top-24 -right-24 size-80 rounded-full bg-[#2f6bff] opacity-40 blur-3xl" />
        <div className="relative">
          <HeroPreview />
        </div>
      </div>
      <p className="mt-3 text-[14px] text-muted">A project in the demo workspace: changed files, agent activity, verification state, and the next handoff.</p>
    </section>
  )
}

function ClosingCta() {
  return (
    <section id="get-started" className="scroll-mt-20 pt-20">
      <div className="relative overflow-hidden bg-[#0b1015] px-6 py-12 sm:px-10">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(rgb(255_251_245/0.12)_1px,transparent_1px)] bg-[size:14px_14px]" />
        <div aria-hidden className="absolute -bottom-32 -left-20 size-96 rounded-full bg-[#0562ef] opacity-35 blur-3xl" />
        <div className="relative max-w-[520px]">
          <h2 className="text-[30px] leading-[1.2] font-normal tracking-[-0.02em] text-[#fffbf5] sm:text-[32px]">
            Stop rebuilding context. Start where the work left off.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#fffbf5]/75">
            Open the demo workspace, inspect a project mid-task, and prepare a handoff to another agent.
          </p>
          <ButtonLink to="/app" variant="primary" icon={<LogoMark onWhite className="size-5" />} className="mt-8">
            Explore Continuum
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}

function FooterLinks({ title, links }: { title: string; links: { label: string; to?: string; href?: string }[] }) {
  return (
    <nav aria-label={title}>
      <p className="mb-3 label-mono text-muted">{title}</p>
      <ul className="space-y-1.5 text-[13px] text-muted">
        {links.map((link) => (
          <li key={link.label}>
            {link.to ? (
              <Link to={link.to} className="hover:text-fg">
                {link.label}
              </Link>
            ) : (
              <a href={link.href} className="hover:text-fg">
                {link.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function LandingPage() {
  useDocumentTitle('')
  const activeId = useScrollSpy(SECTION_IDS)

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
        <Link to="/" aria-label="Continuum home">
          <Logo />
        </Link>
        <ButtonLink to="/app" variant="primary" size="sm">
          Explore the demo
        </ButtonLink>
      </header>

      <div className="mx-auto grid max-w-[1200px] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden border-r border-line lg:block">
          <LandingSidebar sections={SECTIONS} activeId={activeId} />
        </aside>

        <main className="min-w-0 px-4 pb-24 sm:px-8 lg:px-[52px]">
          <Hero />

          <section id="problem" className="scroll-mt-20 pt-20">
            <SectionIntro eyebrow="The problem" title="Your code stays. Your context disappears." />
            <div className="max-w-[600px] space-y-6 text-[17px] leading-[1.6] text-fg">
              <p>
                Developers move between Claude Code, Codex, Cursor and ChatGPT for usage limits, model strengths, or preference. The repository moves
                with them. <span className="text-accent">The understanding of the work does not.</span>
              </p>
              <ol className="divide-y divide-line border-y border-line">
                {PROBLEMS.map((problem, index) => (
                  <li key={problem.title} className="flex gap-5 py-4">
                    <span className="pt-1 label-mono text-subtle">0{index + 1}</span>
                    <p className="text-[16px] leading-[1.55]">
                      <span className="font-medium">{problem.title}</span> <span className="text-muted">{problem.body}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section id="how-it-works" className="scroll-mt-20 pt-20">
            <SectionIntro eyebrow="How it works" title="Capture. Connect. Continue." />
            <p className="mb-8 max-w-[600px] text-[17px] leading-[1.6] text-muted">
              Continuum <span className="text-fg">captures</span> supported agent activity and project changes, <span className="text-fg">connects</span>{' '}
              tasks, files, decisions and verification results, and helps you <span className="text-fg">continue</span> with focused context for another
              compatible agent.
            </p>
            <FlowDiagram />
            <p className="mt-5 border-l-2 border-accent pl-3 text-[13px] text-muted">
              Planned capabilities. In this prototype, capture and connection are represented by mock records; handoff preparation is fully interactive.
            </p>
          </section>

          <section id="features" className="scroll-mt-20 pt-20">
            <SectionIntro eyebrow="Features" title="More than a conversation summary." />
            <p className="mb-8 max-w-[600px] text-[17px] leading-[1.6] text-muted">An evolving, evidence-backed picture of the actual software project.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, caption, body }) => (
                <div key={title} className="cn-ticks border border-line bg-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[16px] font-medium tracking-[-0.01em] text-fg">{title}</h3>
                    <Icon className="size-4 text-accent" aria-hidden />
                  </div>
                  <p className="mt-1 label-mono text-subtle">{caption}</p>
                  <p className="mt-4 text-[14px] leading-[1.55] text-muted">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <ClosingCta />

          <footer className="mt-20 grid gap-8 border-t border-line pt-10 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-[13px] text-muted">
                Project continuity across AI coding agents. Frontend prototype; every project, agent and event shown is mock data.
              </p>
            </div>
            <FooterLinks
              title="Demo"
              links={[
                { label: 'Dashboard', to: '/app' },
                { label: 'Handoffs', to: '/app/handoffs' },
                { label: 'Memory explorer', to: '/app/memory' },
              ]}
            />
            <FooterLinks
              title="Product"
              links={[
                { label: 'How it works', href: '#how-it-works' },
                { label: 'Features', href: '#features' },
                { label: 'Privacy & architecture', to: '/app/settings' },
              ]}
            />
          </footer>
        </main>
      </div>
    </div>
  )
}
