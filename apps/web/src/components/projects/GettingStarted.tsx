import { CircleCheck, CircleDashed, X } from 'lucide-react'
import { useState } from 'react'
import type { ProjectWorkspace } from '@continuum/core'
import { createPersistentStore } from '../../services/storage'
import { cn } from '../../utils/cn'
import { Panel } from '../shared/Panel'

interface Step {
  id: string
  title: string
  done: boolean
  /** What to do, with an optional command to run in the repository. */
  hint: string
  command?: string
}

/** Each step is judged from live records, so it ticks itself off as the work happens. */
function stepsFor(workspace: ProjectWorkspace): Step[] {
  return [
    {
      id: 'connect',
      title: 'Connect Claude Code',
      done: workspace.setup?.agentConnected ?? false,
      hint: 'In the repository, run:',
      command: 'continuum setup claude-code',
    },
    {
      id: 'session',
      title: 'Work in a Claude Code session',
      done: workspace.sessions.length > 0,
      hint: 'Start Claude Code in the repository and approve the "continuum" MCP server. Each session is recorded as you work.',
    },
    {
      id: 'task',
      title: 'Record what you are working on',
      done: workspace.tasks.length > 0,
      hint: 'Ask Claude to "start a Continuum task for this"; it records the objective, steps and next action with start_task.',
    },
    {
      id: 'check',
      title: 'Record a check',
      done: workspace.verification.length > 0,
      hint: 'Tests Claude runs are recorded automatically. To record a verified run yourself:',
      command: 'continuum run -- npm test',
    },
  ]
}

const dismissed = createPersistentStore<string[]>('getting-started.dismissed', [], (value): value is string[] => Array.isArray(value))

/** First-run guide for a live project; disappears once every step is done, or when dismissed. */
export function GettingStarted({ workspace }: { workspace: ProjectWorkspace }) {
  const projectId = workspace.project.id
  const [isDismissed, setDismissed] = useState(() => dismissed.load().includes(projectId))
  const steps = stepsFor(workspace)
  const remaining = steps.filter((step) => !step.done).length
  if (!workspace.setup || remaining === 0 || isDismissed) return null

  const dismiss = () => {
    dismissed.save([...dismissed.load().filter((id) => id !== projectId), projectId])
    setDismissed(true)
  }

  return (
    <Panel
      id="getting-started"
      title="Getting started"
      description={`${steps.length - remaining} of ${steps.length} done. Each step ticks itself off when Continuum records it.`}
      actions={
        <button type="button" onClick={dismiss} className="rounded p-1 text-subtle hover:text-fg" aria-label="Hide getting started">
          <X className="size-4" aria-hidden />
        </button>
      }
    >
      <ol className="space-y-3">
        {steps.map((step) => {
          const Icon = step.done ? CircleCheck : CircleDashed
          return (
            <li key={step.id} className="flex gap-3">
              <Icon className={cn('mt-0.5 size-4 shrink-0', step.done ? 'text-success' : 'text-subtle')} aria-hidden />
              <div className="min-w-0">
                <p className={cn('text-[13px] font-medium', step.done ? 'text-muted line-through decoration-line-strong' : 'text-fg')}>
                  {step.title}
                  <span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
                </p>
                {!step.done && (
                  <>
                    <p className="text-[12.5px] text-muted">{step.hint}</p>
                    {step.command && <code className="mt-1 inline-block rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg">{step.command}</code>}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
