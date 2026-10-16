import { ArrowRight, ArrowRightLeft, CircleCheck, CircleDot, Clock, FilePen, FilePlus2, GitBranch, Terminal } from 'lucide-react'
import type { ReactNode } from 'react'

const FILES = [
  { path: 'src/auth/login.ts', added: false },
  { path: 'src/auth/google-callback.ts', added: true },
  { path: 'src/auth/session.ts', added: false },
  { path: 'tests/auth/login.test.ts', added: true },
]

const EVENTS = [
  { time: '-43m', text: 'Task started in Claude Code' },
  { time: '-32m', text: 'Google callback added' },
  { time: '-26m', text: 'Session ended before full verification' },
]

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface-2/40 p-3">
      <p className="mb-2 label-mono text-subtle ">{title}</p>
      {children}
    </div>
  )
}

/** A static, simplified illustration of the project workspace. Not interactive. */
export function HeroPreview() {
  return (
    <div role="img" aria-label="Illustration of a Continuum project view: changed files, agent activity, verification state, and a handoff action." className="rounded-xl border border-line-strong bg-surface p-3 sm:p-4">
      <div aria-hidden>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-fg">Startup App</p>
            <p className="flex items-center gap-1 font-mono text-[11px] text-muted">
              <GitBranch className="size-3" /> feature/google-auth
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">
            <CircleDot className="size-3" /> In progress
          </span>
        </div>

        <p className="mb-3 text-[13px] text-fg">
          Implement Google authentication <span className="text-muted">· 1 of 4 criteria complete</span>
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          <Column title="Files changed">
            <ul className="space-y-1.5">
              {FILES.map((file) => (
                <li key={file.path} className="flex items-center gap-1.5 font-mono text-[10.5px] text-fg">
                  {file.added ? <FilePlus2 className="size-3 shrink-0 text-success" /> : <FilePen className="size-3 shrink-0 text-accent" />}
                  <span className="truncate">{file.path}</span>
                </li>
              ))}
            </ul>
          </Column>
          <Column title="Agent activity">
            <ul className="space-y-1.5">
              {EVENTS.map((event) => (
                <li key={event.text} className="flex gap-1.5 text-[11px] text-fg">
                  <Terminal className="mt-0.5 size-3 shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate">{event.text}</span>
                    <span className="font-mono text-[10px] text-subtle">{event.time}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Column>
          <Column title="Verification">
            <ul className="space-y-2 text-[11px]">
              <li className="flex items-center justify-between gap-2 text-fg">
                Auth tests
                <span className="inline-flex items-center gap-1 text-warning">
                  <Clock className="size-3" /> Out of date
                </span>
              </li>
              <li className="flex items-center justify-between gap-2 text-fg">
                Type check
                <span className="inline-flex items-center gap-1 text-success">
                  <CircleCheck className="size-3" /> Passed
                </span>
              </li>
            </ul>
          </Column>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-2/60 px-3 py-2.5">
          <p className="flex items-center gap-2 text-[12px] text-fg">
            Claude Code <ArrowRight className="size-3.5 text-subtle" /> Codex
            <span className="text-muted">· next: complete callback validation</span>
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-strong px-2.5 py-1 text-[11px] font-medium text-accent-fg">
            <ArrowRightLeft className="size-3" /> Prepare handoff
          </span>
        </div>
      </div>
    </div>
  )
}
