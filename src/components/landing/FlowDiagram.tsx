import { Bot, FileCode2, FlaskConical, Landmark, Network, Terminal, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

const INPUTS: { icon: LucideIcon; label: string }[] = [
  { icon: Terminal, label: 'Agent sessions' },
  { icon: FileCode2, label: 'File changes' },
  { icon: FlaskConical, label: 'Test results' },
]

function Tile({ icon: Icon, label, tone = 'plain', caption }: { icon: LucideIcon; label: string; tone?: 'plain' | 'accent'; caption?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          'flex size-14 items-center justify-center border [&_svg]:size-5',
          tone === 'accent' ? 'border-accent-strong bg-accent-strong text-accent-fg' : 'border-line bg-surface-2 text-fg',
        )}
      >
        <Icon aria-hidden />
      </div>
      <p className="label-mono text-center text-fg">{label}</p>
      {caption && <p className="-mt-1 label-mono text-accent">{caption}</p>}
    </div>
  )
}

/** "Figure 1": how the planned product turns raw activity into context for the next agent. */
export function FlowDiagram() {
  return (
    <figure>
      <div className="cn-dots border border-line px-6 py-8 sm:px-8">
        <div className="grid items-center gap-8 md:grid-cols-[auto_1fr_auto] md:gap-6">
          <div>
            <p className="mb-4 label-mono text-muted md:text-center">Raw activity</p>
            <div className="flex justify-around gap-4 md:flex-col md:gap-5">
              {INPUTS.map((input) => (
                <Tile key={input.label} {...input} />
              ))}
            </div>
          </div>

          <div className="relative">
            <span aria-hidden className="absolute top-1/2 -left-6 hidden w-6 border-t border-dashed border-line-strong md:block" />
            <span aria-hidden className="absolute top-1/2 -right-6 hidden w-6 border-t border-dashed border-line-strong md:block" />
            <div className="border border-line-strong bg-surface p-5">
              <p className="mb-4 label-mono text-fg">Continuum</p>
              <div className="border border-dashed border-accent/50 px-3 py-1.5 text-center label-mono text-accent">Decisions, constraints, and previous attempts</div>
              <div className="mt-5 flex items-start justify-around gap-4">
                <Tile icon={Landmark} label="Project state" tone="accent" />
                <span aria-hidden className="mt-7 hidden flex-1 border-t border-dashed border-line-strong sm:block" />
                <Tile icon={Network} label="Memory graph" caption="tasks · files · checks" />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-4 label-mono text-muted md:text-center">Handoff package</p>
            <Tile icon={Bot} label="Next agent's context" />
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-[14px] text-muted">
        Figure 1. Agent sessions, file changes, and test results become one project state. A handoff turns that state into focused context for the next
        agent. In this prototype every input is mock data.
      </figcaption>
    </figure>
  )
}
