import { ArrowRight, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AGENTS, getAgent } from '@continuum/core'
import { useProjects, useWorkspace } from '../../hooks/useWorkspace'
import type { ProjectWorkspace } from '../../services'
import { useHandoffs } from '../../state/handoffs'
import { usePreferences } from '../../state/preferences'
import { useToast } from '../../state/toasts'
import { useUI, type HandoffDialogTarget } from '../../state/ui'
import type { AgentType, ContextCategory, ProjectTask } from '@continuum/core'
import { buildHandoffContext, type HandoffContext } from '@continuum/core'
import { CONTEXT_CATEGORIES } from '@continuum/core'
import { Button } from '../shared/Button'
import { Dialog } from '../shared/Dialog'
import { Checkbox, SelectField } from '../shared/Fields'
import { EmptyState, ErrorState, LoadingBlock } from '../shared/States'
import { HandoffContextPreview, TokenEstimate } from './HandoffContextPreview'

function pickTarget(source: AgentType, preferred: AgentType): AgentType {
  if (preferred !== source) return preferred
  return AGENTS.find((agent) => agent.id !== source)?.id ?? 'other'
}

/** The task a handoff defaults to: the requested one, else the project's current task, else the first unfinished one. */
function resolveTask(workspace: ProjectWorkspace, requestedId: string): ProjectTask | undefined {
  const { tasks, project } = workspace
  return (
    tasks.find((task) => task.id === requestedId) ??
    tasks.find((task) => task.id === project.currentTaskId) ??
    tasks.find((task) => task.status !== 'completed') ??
    tasks[0]
  )
}

function tryBuildContext(...args: Parameters<typeof buildHandoffContext>): HandoffContext | Error {
  try {
    return buildHandoffContext(...args)
  } catch (error) {
    return error instanceof Error ? error : new Error('Could not build handoff context.')
  }
}

function HandoffForm({ initial, onDone }: { initial: HandoffDialogTarget; onDone: () => void }) {
  const { preferences } = usePreferences()
  const { createHandoff } = useHandoffs()
  const notify = useToast()
  const navigate = useNavigate()
  const projects = useProjects()

  const [projectId, setProjectId] = useState(initial.projectId ?? preferences.defaultProjectId)
  const [requestedTaskId, setRequestedTaskId] = useState(initial.taskId ?? '')
  const [sourceAgent, setSourceAgent] = useState<AgentType>(preferences.preferredSourceAgent)
  const [targetAgent, setTargetAgent] = useState<AgentType>(() =>
    pickTarget(preferences.preferredSourceAgent, preferences.preferredTargetAgent),
  )
  const [included, setIncluded] = useState<ContextCategory[]>(preferences.defaultContext)

  const workspace = useWorkspace(projectId)
  const task = workspace.data ? resolveTask(workspace.data, requestedTaskId) : undefined

  const context = useMemo(() => {
    if (!workspace.data || !task) return undefined
    return tryBuildContext({ workspace: workspace.data, taskId: task.id, sourceAgent, targetAgent, includedContext: included })
  }, [workspace.data, task, sourceAgent, targetAgent, included])

  const changeSource = (agent: AgentType) => {
    setSourceAgent(agent)
    if (agent === targetAgent) setTargetAgent(pickTarget(agent, preferences.preferredTargetAgent))
  }

  const toggleCategory = (category: ContextCategory, checked: boolean) =>
    setIncluded((current) => (checked ? [...current, category] : current.filter((item) => item !== category)))

  const canSubmit = task !== undefined && included.length > 0 && context !== undefined && !(context instanceof Error)

  const submit = () => {
    if (!task || !canSubmit) return
    const handoff = createHandoff({ projectId, taskId: task.id, sourceAgent, targetAgent, includedContext: included })
    notify('Handoff draft saved. Review the context, then copy it or mark it as prepared.', 'info')
    onDone()
    navigate(`/app/handoffs/${handoff.id}`)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form
        id="handoff-form"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <SelectField label="Source agent" value={sourceAgent} onChange={(event) => changeSource(event.target.value as AgentType)}>
            {AGENTS.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </SelectField>
          <ArrowRight className="mx-auto hidden size-4 text-subtle sm:mb-2.5 sm:block" aria-hidden />
          <SelectField label="Target agent" value={targetAgent} onChange={(event) => setTargetAgent(event.target.value as AgentType)}>
            {AGENTS.filter((agent) => agent.id !== sourceAgent).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Project"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              setRequestedTaskId('')
            }}
          >
            {(projects.data ?? []).map(({ project }) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
            {!projects.data && <option value={projectId}>Loading…</option>}
          </SelectField>
          <SelectField label="Task" value={task?.id ?? ''} onChange={(event) => setRequestedTaskId(event.target.value)} disabled={!workspace.data}>
            {(workspace.data?.tasks ?? []).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
                {candidate.status === 'completed' ? ' (completed)' : ''}
              </option>
            ))}
            {!workspace.data && <option value="">Loading…</option>}
          </SelectField>
        </div>

        <fieldset>
          <legend className="mb-2 text-[12px] font-medium text-muted">Context to include</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTEXT_CATEGORIES.map((category) => (
              <Checkbox
                key={category.id}
                checked={included.includes(category.id)}
                onChange={(checked) => toggleCategory(category.id, checked)}
                label={category.label}
                hint={category.hint}
              />
            ))}
          </div>
          {included.length === 0 && (
            <p role="alert" className="mt-2 text-[12px] text-warning">
              Select at least one category to prepare a handoff.
            </p>
          )}
        </fieldset>

        <p className="flex gap-2 rounded-md border border-line bg-surface-2/60 p-3 text-[12px] text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Preparing creates a context package you can copy into {getAgent(targetAgent).name}. Nothing is sent to any agent.
        </p>
      </form>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-medium text-fg">Context preview</h3>
          {context && !(context instanceof Error) && <TokenEstimate tokens={context.estimatedTokens} />}
        </div>
        {workspace.isLoading && <LoadingBlock rows={3} label="Loading project context" />}
        {workspace.error && <ErrorState title="Could not load this project" description={workspace.error.message} />}
        {workspace.data && !task && <EmptyState title="This project has no tasks" description="Choose another project to prepare a handoff." />}
        {context instanceof Error && <ErrorState title="Handoff could not be prepared" description={context.message} />}
        {context && !(context instanceof Error) && <HandoffContextPreview context={context} compact />}
      </div>
    </div>
  )
}

export function HandoffDialog() {
  const { handoffDialog, closeHandoffDialog } = useUI()
  const formKey = handoffDialog ? `${handoffDialog.projectId ?? ''}:${handoffDialog.taskId ?? ''}` : 'closed'

  return (
    <Dialog
      open={handoffDialog !== null}
      onClose={closeHandoffDialog}
      title="Prepare handoff"
      description="Package the current project state so another agent can continue the work."
      size="xl"
      footer={
        <>
          <Button onClick={closeHandoffDialog}>Cancel</Button>
          <Button variant="primary" type="submit" form="handoff-form">
            Prepare Handoff
          </Button>
        </>
      }
    >
      {handoffDialog && <HandoffForm key={formKey} initial={handoffDialog} onDone={closeHandoffDialog} />}
    </Dialog>
  )
}
