import { ArrowRightLeft, CircleCheck, CircleDashed, Compass, Pencil } from 'lucide-react'
import { useState } from 'react'
import type { ProjectTask, TaskField, TaskStatus, VerificationRecord, VerificationStatus } from '@continuum/core'
import { cn } from '../../utils/cn'
import { PROJECT_STATUS_LABEL, VERIFICATION_LABEL } from '@continuum/core'
import { useTaskEditor, type TaskEditor } from '../../hooks/useTaskEditor'
import { useIsLive } from '../../state/dataMode'
import { Button } from '../shared/Button'
import { SelectField } from '../shared/Fields'
import { Panel } from '../shared/Panel'
import { CriterionBadge, EvidenceBadge, TaskStatusBadge } from '../shared/StatusBadge'
import { ProgressBar } from './ProjectCard'

const TASK_STATUSES: TaskStatus[] = ['planned', 'in-progress', 'blocked', 'completed']
const FIELD_LABEL: Record<TaskField, string> = { status: 'status', nextAction: 'next action', steps: 'steps', criteria: 'acceptance criteria' }
/** Matches the daemon's limit on a next action. */
const MAX_NEXT_ACTION_CHARS = 500

interface TaskPanelProps {
  tasks: ProjectTask[]
  task: ProjectTask
  currentTaskId?: string
  verification: VerificationRecord[]
  onSelectTask: (taskId: string) => void
  onPrepareHandoff: () => void
}

function StepList({ title, steps, done, editor }: { title: string; steps: string[]; done: boolean; editor?: TaskEditor }) {
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
              <span className="flex-1">{step}</span>
              {editor && (
                <button
                  type="button"
                  disabled={editor.isSaving}
                  onClick={() => void editor.apply({ kind: 'step', step, done: !done })}
                  className="shrink-0 text-[12px] text-muted underline decoration-line-strong underline-offset-2 hover:text-fg disabled:opacity-50"
                  aria-label={done ? `Mark "${step}" as not done` : `Mark "${step}" as done`}
                >
                  {done ? 'Undo' : 'Mark done'}
                </button>
              )}
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

function NextActionEditor({ task, editor }: { task: ProjectTask; editor: TaskEditor }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setDraft(task.nextAction ?? '')}>
        {task.nextAction ? 'Edit next action' : 'Set next action'}
      </Button>
    )
  }
  const save = async () => {
    // Keep what was typed if the save failed, so nothing is lost.
    if (await editor.apply({ kind: 'next-action', nextAction: draft.trim() === '' ? null : draft })) setDraft(null)
  }
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <label className="sr-only" htmlFor={`next-action-${task.id}`}>
        Next action
      </label>
      <input
        id={`next-action-${task.id}`}
        autoFocus
        value={draft}
        maxLength={MAX_NEXT_ACTION_CHARS}
        onChange={(event) => setDraft(event.target.value)}
        className="h-8 flex-1 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg focus:border-accent focus:outline-none"
      />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" disabled={editor.isSaving}>
          Save
        </Button>
        <Button size="sm" onClick={() => setDraft(null)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function TaskPanel({ tasks, task, currentTaskId, verification, onSelectTask, onPrepareHandoff }: TaskPanelProps) {
  const isLive = useIsLive()
  const taskEditor = useTaskEditor(task.projectId, task.id)
  // Only live data can be edited: the demo dataset is shared and read-only.
  const editor = isLive ? taskEditor : undefined
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
            <EvidenceBadge type="agent-reported" />
          </div>
          {task.userEdited && task.userEdited.length > 0 && (
            <p className="mt-1.5 flex items-center gap-2 text-[12px] text-muted">
              <EvidenceBadge type="user-reported" />
              <span>Changed by you: {task.userEdited.map((field) => FIELD_LABEL[field]).join(', ')}</span>
            </p>
          )}
          {editor && (
            <div className="mt-3 w-48">
              <SelectField
                label="Status"
                value={task.status}
                disabled={editor.isSaving}
                onChange={(event) => void editor.apply({ kind: 'status', status: event.target.value as TaskStatus })}
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {PROJECT_STATUS_LABEL[status]}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          <p className="mt-1 text-[13px] text-muted">{task.description}</p>
          <p className="mt-3 text-[13px] text-fg">
            <span className="font-medium text-muted">Objective: </span>
            {task.objective}
          </p>
        </div>

        {task.acceptanceCriteria.length > 0 && (
          <div>
            <div className="mb-2 flex items-end justify-between gap-4">
              <h3 className="label-mono text-muted">Acceptance criteria</h3>
              <div className="w-40">
                <ProgressBar done={criteriaDone} total={task.acceptanceCriteria.length} label="Complete" />
              </div>
            </div>
            <ul className="divide-y divide-line rounded-md border border-line">
              {task.acceptanceCriteria.map((criterion, index) => (
                <li key={criterion.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                  <div className="sm:w-24 sm:shrink-0">
                    <CriterionBadge status={criterion.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-fg">{criterion.text}</p>
                    <p className="text-[12px] text-subtle">{criterion.evidence}</p>
                  </div>
                  {editor && (
                    <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                      <input
                        type="checkbox"
                        checked={criterion.status === 'complete'}
                        disabled={editor.isSaving}
                        onChange={(event) => void editor.apply({ kind: 'criterion', index, text: criterion.text, met: event.target.checked })}
                      />
                      Met
                    </label>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <StepList title="Completed steps" steps={task.completedSteps} done editor={editor} />
          <StepList title="Remaining steps" steps={task.remainingSteps} done={false} editor={editor} />
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
        {/* Keyed by task only: a live refresh (an agent changing the next action) must not wipe what you are typing. */}
        {editor && <NextActionEditor key={task.id} task={task} editor={editor} />}
      </div>
    </Panel>
  )
}
