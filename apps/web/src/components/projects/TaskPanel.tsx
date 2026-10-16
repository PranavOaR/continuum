import { ArrowRightLeft, CircleCheck, CircleDashed, Compass } from 'lucide-react'
import type { ProjectTask, VerificationRecord, VerificationStatus } from '@continuum/core'
import { cn } from '../../utils/cn'
import { VERIFICATION_LABEL } from '@continuum/core'
import { Button } from '../shared/Button'
import { Panel } from '../shared/Panel'
import { CriterionBadge, TaskStatusBadge } from '../shared/StatusBadge'
import { ProgressBar } from './ProjectCard'

interface TaskPanelProps {
  tasks: ProjectTask[]
  task: ProjectTask
  currentTaskId?: string
  verification: VerificationRecord[]
  onSelectTask: (taskId: string) => void
  onPrepareHandoff: () => void
}

function StepList({ title, steps, done }: { title: string; steps: string[]; done: boolean }) {
  const Icon = done ? CircleCheck : CircleDashed
  return (
    <div>
      <h3 className="mb-2 label-mono text-muted">
        {title} <span className="font-normal text-subtle">({steps.length})</span>
      </h3>
      {steps.length === 0 ? (
        <p className="text-[13px] text-subtle">None.</p>
      ) : (
        <ul className="space-y-1.5">
          {steps.map((step) => (
            <li key={step} className="flex gap-2 text-[13px] text-fg">
              <Icon className={cn('mt-0.5 size-4 shrink-0', done ? 'text-success' : 'text-subtle')} aria-hidden />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VerificationSummary({ records }: { records: VerificationRecord[] }) {
  if (records.length === 0) return <span>No checks recorded for this task.</span>
  const counts = records.reduce<Partial<Record<VerificationStatus, number>>>(
    (acc, record) => ({ ...acc, [record.status]: (acc[record.status] ?? 0) + 1 }),
    {},
  )
  return (
    <span>
      {Object.entries(counts)
        .map(([status, count]) => `${count} ${VERIFICATION_LABEL[status as VerificationStatus].toLowerCase()}`)
        .join(' · ')}
    </span>
  )
}

export function TaskPanel({ tasks, task, currentTaskId, verification, onSelectTask, onPrepareHandoff }: TaskPanelProps) {
  const criteriaDone = task.acceptanceCriteria.filter((criterion) => criterion.status === 'complete').length
  const taskVerification = verification.filter((record) => task.verificationIds.includes(record.id))
  const isFinished = task.status === 'completed'

  return (
    <Panel
      id="task"
      title="Task"
      description="Select a task to inspect its state."
      actions={
        !isFinished && (
          <Button size="sm" icon={<ArrowRightLeft />} onClick={onPrepareHandoff}>
            Prepare Handoff
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2" role="group" aria-label="Project tasks">
        {tasks.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === task.id}
            onClick={() => onSelectTask(candidate.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
              candidate.id === task.id ? 'bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {candidate.title}
            {candidate.id === currentTaskId && <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">current</span>}
          </button>
        ))}
      </div>

      <div className="space-y-5 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[22px] font-normal tracking-[-0.02em] text-fg">{task.title}</h3>
            <TaskStatusBadge status={task.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted">{task.description}</p>
          <p className="mt-3 text-[13px] text-fg">
            <span className="font-medium text-muted">Objective: </span>
            {task.objective}
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between gap-4">
            <h3 className="label-mono text-muted">Acceptance criteria</h3>
            <div className="w-40">
              <ProgressBar done={criteriaDone} total={task.acceptanceCriteria.length} label="Complete" />
            </div>
          </div>
          <ul className="divide-y divide-line rounded-md border border-line">
            {task.acceptanceCriteria.map((criterion) => (
              <li key={criterion.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                <div className="sm:w-24 sm:shrink-0">
                  <CriterionBadge status={criterion.status} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] text-fg">{criterion.text}</p>
                  <p className="text-[12px] text-subtle">{criterion.evidence}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <StepList title="Completed steps" steps={task.completedSteps} done />
          <StepList title="Remaining steps" steps={task.remainingSteps} done={false} />
        </div>

        <p className="text-[12px] text-muted">
          Verification is tracked separately from task progress:{' '}
          <a href="#verification" className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">
            <VerificationSummary records={taskVerification} />
          </a>
        </p>

        {task.nextAction && (
          <div className="flex flex-col gap-3 rounded-md border border-accent/30 bg-accent/5 p-3 sm:flex-row sm:items-center">
            <Compass className="size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="label-mono text-accent ">Next recommended action</p>
              <p className="text-[13px] text-fg">{task.nextAction}</p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
