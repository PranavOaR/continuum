import { ArrowRight, ArrowRightLeft, Brain, Check, Code2, Copy, GitCompareArrows, HardDrive, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ActivityFlow } from '../components/landing/ActivityFlow'
import { HeroPreview } from '../components/landing/HeroPreview'
import { useScrollSpy } from '../components/landing/useScrollSpy'
import { ButtonLink, buttonClass } from '../components/shared/Button'
import { Logo } from '../components/shared/Logo'
import { AGENTS } from '../data/agents'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { cn } from '../utils/cn'
import { copyToClipboard } from '../utils/clipboard'

const NAV_SECTIONS = [
  { id: 'product', label: 'Product' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'features', label: 'Features' },
] as const
const SPY_IDS = NAV_SECTIONS.map((section) => section.id)

const SAMPLE_HANDOFF = `# Continuum handoff context
Project: Startup App · Task: Implement Google authentication
From: Claude Code → To: Codex

## Next steps
- Recommended next action: Inspect the current diff, complete callback validation, then run the authentication tests.

> Example generated from mock data.`

const COPY_RESET_MS = 2000

const PROBLEMS = [
  { title: 'Every new session starts blank', body: 'You re-explain the architecture, the task, and what was already tried — again.' },
  { title: 'Handoffs are written by hand', body: 'Summaries come from memory, and quietly drift from what actually changed.' },
  { title: 'Unfinished work hides', body: 'Which files changed? Which tests ran? What was abandoned? It all takes digging.' },
]

const FEATURES: { icon: LucideIcon; title: string; caption: string; body: string }[] = [
  { icon: Brain, title: 'Project-aware memory', caption: 'Decisions · issues · attempts', body: 'Typed records tied to the tasks and files they affect.' },
  { icon: GitCompareArrows, title: 'Change tracking', caption: 'Per session, per file', body: 'See which files each session touched and why they matter.' },
  { icon: ShieldCheck, title: 'Evidence-backed state', caption: 'Observed · verified · inferred', body: 'Every claim is labelled with how Continuum knows it.' },
  { icon: ArrowRightLeft, title: 'Cross-agent handoffs', caption: 'Choose what to include', body: 'A focused context package for whichever agent comes next.' },
  { icon: Code2, title: 'Code-aware retrieval', caption: 'Files · symbols · tests', body: 'Context assembled around what the task actually touches.' },
  { icon: HardDrive, title: 'Local-first', caption: 'No mandatory AI APIs', body: 'Designed to index and retrieve on your own machine.' },
]

function Eyebrow({ index, children }: { index: string; children: ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-3 label-mono text-accent">
      <span>{index}</span>
      <span aria-hidden className="h-px w-8 bg-accent/40" />
      <span className="text-muted">{children}</span>
    </p>
  )
}

function SectionTitle({ children, lead }: { children: ReactNode; lead?: ReactNode }) {
  return (
    <div className="mb-10 max-w-[640px]">
      <h2 className="text-[30px] leading-[1.15] font-normal tracking-display text-fg sm:text-[36px]">{children}</h2>
      {lead && <p className="mt-4 text-[17px] leading-[1.6] text-muted">{lead}</p>}
    </div>
  )
}

/** The brand's thread motif, drawn once beneath a word in the headline. */
function ThreadUnderline() {
  return (
    <svg aria-hidden viewBox="0 0 300 24" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3.5 w-full overflow-visible" fill="none">
      <path d="M2 16 C 60 4, 110 22, 160 12 S 250 4, 298 14" pathLength={1} className="cn-draw stroke-accent" strokeWidth="3" strokeLinecap="round" />
      <circle cx="298" cy="14" r="4" className="fill-accent" />
    </svg>
  )
}

function CopyExampleButton() {
  const [isCopied, setCopied] = useState(false)
  const copy = async () => {
    const result = await copyToClipboard(SAMPLE_HANDOFF)
    if (!result.ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), COPY_RESET_MS)
  }
  return (
    <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 font-mono text-[12px] text-muted hover:text-fg">
      {isCopied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span aria-live="polite">{isCopied ? 'Example handoff copied' : 'Copy an example handoff'}</span>
    </button>
  )
}

function SiteHeader({ activeId }: { activeId: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1160px] items-center justify-between gap-4 px-4 sm:px-8">
        <Link to="/" aria-label="Continuum home">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-1 rounded-full border border-line bg-surface p-1 md:flex">
          {NAV_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={activeId === section.id ? 'location' : undefined}
                className={cn(
                  'block rounded-full px-3.5 py-1.5 text-[13px] transition-colors',
                  activeId === section.id ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
        <ButtonLink to="/app" variant="primary" size="sm">
          Explore the demo <ArrowRight aria-hidden />
        </ButtonLink>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section id="product" className="relative scroll-mt-16 overflow-hidden">
      <div aria-hidden className="cn-glow absolute inset-0" />
      <div aria-hidden className="cn-dots cn-dots-fade absolute inset-0 opacity-70" />
      <div className="relative mx-auto grid max-w-[1160px] items-center gap-12 px-4 pt-16 pb-20 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-24 lg:pb-28">
        <div>
          <Link to="/app" className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-[13px] text-muted hover:border-line-strong">
            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent">prototype</span>
            Interactive demo with sample data
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>

          <h1 className="mt-7 text-[42px] leading-[1.05] font-normal tracking-display text-fg sm:text-[56px]">
            Your work{' '}
            <span className="relative inline-block whitespace-nowrap">
              continues.
              <ThreadUnderline />
            </span>
            <br />
            <span className="text-muted">Your agents change.</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-[17px] leading-[1.6] text-muted">
            Switch between AI coding agents without losing your project's context, progress, or next steps. Continuum keeps track of what changed, what
            remains unfinished, and what the next agent needs to know.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to="/app" variant="primary" className="h-11 px-5">
              Explore the demo <ArrowRight aria-hidden />
            </ButtonLink>
            <a href="#how-it-works" className={buttonClass('secondary', 'md', 'h-11 px-5')}>
              See how it works
            </a>
          </div>
          <div className="mt-5">
            <CopyExampleButton />
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-2">
            <p className="mr-1 label-mono text-subtle">Designed for</p>
            {AGENTS.filter((agent) => agent.id !== 'other').map((agent) => (
              <span key={agent.id} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] text-muted">
                {agent.name}
              </span>
            ))}
          </div>
        </div>

        <div className="relative lg:pl-4">
          <div aria-hidden className="absolute -inset-4 -z-0 rounded-[22px] border border-dashed border-accent/25" />
          <div className="relative">
            <HeroPreview />
          </div>
        </div>
      </div>
    </section>
  )
}

function ClosingCta() {
  return (
    <section className="mx-auto max-w-[1160px] px-4 pb-24 sm:px-8">
      <div className="relative overflow-hidden rounded-2xl bg-[#141318] px-6 py-14 sm:px-12">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(36rem_20rem_at_100%_0%,rgb(91_69_255/0.45),transparent_70%)]" />
        <svg aria-hidden viewBox="0 0 600 200" className="absolute right-0 bottom-0 hidden h-full w-1/2 md:block" fill="none" preserveAspectRatio="xMaxYMax meet">
          <path d="M20 170 C 140 170, 180 60, 300 90 S 470 160, 580 40" stroke="rgb(244 242 238 / 0.25)" strokeWidth="2" strokeDasharray="4 6" />
          <circle cx="20" cy="170" r="6" fill="#141318" stroke="rgb(244 242 238 / 0.6)" strokeWidth="2" />
          <circle cx="300" cy="90" r="4" fill="rgb(244 242 238 / 0.7)" />
          <circle cx="580" cy="40" r="8" fill="#8f7fff" />
        </svg>
        <div className="relative max-w-[520px]">
          <h2 className="text-[32px] leading-[1.15] font-normal tracking-display text-[#f4f2ee] sm:text-[38px]">Stop rebuilding context. Start where the work left off.</h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#f4f2ee]/70">Open the demo workspace, inspect a project mid-task, and prepare a handoff to another agent.</p>
          <ButtonLink to="/app" variant="primary" className="mt-8 h-11 px-5">
            Explore Continuum <ArrowRight aria-hidden />
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}

export function LandingPage() {
  useDocumentTitle('')
  const activeId = useScrollSpy(SPY_IDS)

  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader activeId={activeId} />
      <main>
        <Hero />

        <section id="how-it-works" className="scroll-mt-16 border-t border-line py-24">
          <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
            <Eyebrow index="01">How it works</Eyebrow>
            <SectionTitle lead="Continuum captures supported agent activity and project changes, connects them to the work they belong to, and condenses the result into context the next agent can use.">
              From one agent's session to the next agent's context.
            </SectionTitle>
            <ActivityFlow />
            <p className="mt-4 text-[13px] text-subtle">Illustrates the planned product. In this prototype, every input is mock data and handoff preparation is fully interactive.</p>
          </div>
        </section>

        <section id="problem" className="border-t border-line bg-surface py-24">
          <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
            <Eyebrow index="02">The problem</Eyebrow>
            <SectionTitle lead="Developers move between Claude Code, Codex, Cursor and ChatGPT for usage limits, model strengths, or preference. The repository moves with them. The understanding of the work does not.">
              Your code stays. Your context disappears.
            </SectionTitle>
            <ol className="grid gap-4 md:grid-cols-3">
              {PROBLEMS.map((problem, index) => (
                <li key={problem.title} className="cn-thread rounded-lg border border-line bg-bg p-6">
                  <span className="font-mono text-[12px] text-subtle">0{index + 1}</span>
                  <h3 className="mt-6 text-[18px] font-normal tracking-[-0.02em] text-fg">{problem.title}</h3>
                  <p className="mt-2 text-[14px] leading-[1.55] text-muted">{problem.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="scroll-mt-16 border-t border-line py-24">
          <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
            <Eyebrow index="03">Features</Eyebrow>
            <SectionTitle lead="An evolving, evidence-backed picture of the actual software project.">More than a conversation summary.</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, caption, body }) => (
                <div key={title} className="cn-thread group rounded-lg border border-line bg-surface p-6 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-line-strong">
                  <span className="flex size-9 items-center justify-center rounded-md bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-fg">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-[16px] font-medium tracking-[-0.01em] text-fg">{title}</h3>
                  <p className="mt-1 label-mono text-subtle">{caption}</p>
                  <p className="mt-3 text-[14px] leading-[1.55] text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <ClosingCta />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1160px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
            <Link to="/app" className="hover:text-fg">Dashboard</Link>
            <Link to="/app/handoffs" className="hover:text-fg">Handoffs</Link>
            <Link to="/app/memory" className="hover:text-fg">Memory explorer</Link>
            <Link to="/app/settings" className="hover:text-fg">Privacy & architecture</Link>
          </nav>
          <p className="text-[12px] text-subtle">Frontend prototype · all data is mock data</p>
        </div>
      </footer>
    </div>
  )
}
