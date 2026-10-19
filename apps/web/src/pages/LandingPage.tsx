import { ArrowRight, Play } from 'lucide-react'
import { useEffect } from 'react'
import { ActivityFlow } from '../components/landing/ActivityFlow'
import { FeatureList } from '../components/landing/FeatureList'
import { HeroPreview } from '../components/landing/HeroPreview'
import { useScrollSpy } from '../components/landing/useScrollSpy'
import { Faq } from '../components/site/Faq'
import { Eyebrow, SectionTitle } from '../components/site/SectionHeading'
import { SiteFooter } from '../components/site/SiteFooter'
import { SiteHeader } from '../components/site/SiteHeader'
import { SPY_IDS } from '../components/site/siteNav'
import { buttonClass } from '../components/shared/Button'
import { AgentPicker } from '../components/site/AgentPicker'
import { DemoVideo } from '../components/site/DemoVideo'
import { InstallCommand } from '../components/site/InstallCommand'
import { GET_STARTED, NPM_URL, PACKAGE_NAME } from '../components/site/siteContent'
import { useDocumentTitle } from '../hooks/useDocumentTitle'


const PROBLEMS = [
  { title: 'Every new session starts blank', body: 'You re-explain the architecture, the task, and what was already tried — again.' },
  { title: 'Handoffs are written by hand', body: 'Summaries come from memory, and quietly drift from what actually changed.' },
  { title: 'Unfinished work hides', body: 'Which files changed? Which tests ran? What was abandoned? It all takes digging.' },
]

/** The brand's thread motif, drawn once beneath a word in the headline. */
function ThreadUnderline() {
  return (
    <svg aria-hidden viewBox="0 0 300 24" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3.5 w-full overflow-visible" fill="none">
      <path d="M2 16 C 60 4, 110 22, 160 12 S 250 4, 298 14" pathLength={1} className="cn-draw stroke-accent" strokeWidth="3" strokeLinecap="round" />
      <circle cx="298" cy="14" r="4" className="fill-accent" />
    </svg>
  )
}


function Hero() {
  return (
    <section id="product" className="relative scroll-mt-16 overflow-hidden">
      <div aria-hidden className="cn-glow absolute inset-0" />
      <div aria-hidden className="cn-dots cn-dots-fade absolute inset-0 opacity-70" />
      <div className="relative mx-auto grid max-w-[1160px] items-center gap-12 px-4 pt-16 pb-20 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-24 lg:pb-28">
        <div>
          <a
            href={NPM_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-[13px] text-muted hover:border-line-strong"
          >
            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent">v0.1.1</span>
            Now on npm: {PACKAGE_NAME}
            <ArrowRight className="size-3.5" aria-hidden />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>

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
            <a href="#get-started" className={buttonClass('primary', 'md', 'h-11 px-5')}>
              Get started <ArrowRight aria-hidden />
            </a>
            <a href="#demo" className={buttonClass('secondary', 'md', 'h-11 px-5')}>
              <Play aria-hidden /> Watch the demo
            </a>
          </div>
          <div className="mt-10">
            <AgentPicker label="Designed for · pick yours" />
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

function DemoSection() {
  return (
    <section id="demo" className="scroll-mt-16 border-t border-line py-24">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
        <Eyebrow index="01">See it work</Eyebrow>
        <SectionTitle lead="A real handoff, start to finish: Claude Code starts a task, Codex finishes it from Continuum's briefing, and the dashboard shows every step.">
          One task. Two agents. Nothing lost.
        </SectionTitle>
        <DemoVideo />
      </div>
    </section>
  )
}

function GetStarted() {
  return (
    <section id="get-started" className="scroll-mt-16 border-t border-line bg-surface py-24">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
        <Eyebrow index="05">Get started</Eyebrow>
        <SectionTitle lead="Needs Node.js 22.13 or newer and git. Everything runs on your machine.">Install it in a minute.</SectionTitle>
        <ol className="grid gap-4">
          {GET_STARTED.map((step, index) => (
            <li
              key={step.title}
              className="cn-thread grid min-w-0 gap-5 rounded-lg border border-line bg-bg p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:items-center md:gap-10"
            >
              <div className="min-w-0">
                <span className="font-mono text-[12px] text-subtle">0{index + 1}</span>
                <h3 className="mt-3 text-[18px] font-normal tracking-[-0.02em] text-fg">{step.title}</h3>
                <p className="mt-2 text-[14px] leading-[1.55] text-muted">{step.body}</p>
              </div>
              {step.command && (
                <div className="min-w-0">{step.command === 'pick-agent' ? <AgentPicker /> : <InstallCommand command={step.command} />}</div>
              )}
            </li>
          ))}
        </ol>
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
          <p className="mt-4 text-[16px] leading-[1.6] text-[#f4f2ee]/70">One command connects your agent. Your dashboard runs on your machine, and nothing leaves it.</p>
          <a href="#get-started" className={buttonClass('primary', 'md', 'mt-8 h-11 px-5')}>
            Get started <ArrowRight aria-hidden />
          </a>
        </div>
      </div>
    </section>
  )
}

export function LandingPage() {
  useDocumentTitle('')
  const activeId = useScrollSpy(SPY_IDS)
  // Arriving from another page at /#section: scroll there once the page has rendered.
  useEffect(() => {
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [])

  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader activeId={activeId} />
      <main>
        <Hero />
        <DemoSection />

        <section id="how-it-works" className="scroll-mt-16 border-t border-line py-24">
          <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
            <Eyebrow index="02">How it works</Eyebrow>
            <SectionTitle lead="Continuum captures supported agent activity and project changes, connects them to the work they belong to, and condenses the result into context the next agent can use.">
              From one agent's session to the next agent's context.
            </SectionTitle>
            <ActivityFlow />
          </div>
        </section>

        <section id="problem" className="border-t border-line bg-surface py-24">
          <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
            <Eyebrow index="03">The problem</Eyebrow>
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
            <Eyebrow index="04">Features</Eyebrow>
            <SectionTitle lead="An evolving, evidence-backed picture of the actual software project.">More than a conversation summary.</SectionTitle>
            <FeatureList />
          </div>
        </section>

        <GetStarted />
        <Faq />
        <ClosingCta />
      </main>

      <SiteFooter />
    </div>
  )
}
