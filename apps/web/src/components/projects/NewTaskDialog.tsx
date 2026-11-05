import { useState } from 'react'
import { MAX_TASK_TEXT_CHARS, MAX_TITLE_CHARS, type ProjectTask } from '@continuum/core'
import { useProjectEditor } from '../../hooks/useProjectEditor'
import { Button } from '../shared/Button'
import { Dialog } from '../shared/Dialog'
import { SelectField, TextField } from '../shared/Fields'

interface NewTaskDialogProps {
  projectId: string
  tasks: ProjectTask[]
  open: boolean
  onClose: () => void
  onCreated: (taskId: string) => void
}

function Form({ projectId, tasks, onClose, onCreated }: Omit<NewTaskDialogProps, 'open'>) {
  const editor = useProjectEditor(projectId)
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const paused = tasks.filter((task) => task.status === 'in-progress')

  const submit = async () => {
    const task = await editor.createTask({
      title,
      start: when === 'now',
      ...(objective.trim() ? { objective } : {}),
      ...(nextAction.trim() ? { nextAction } : {}),
    })
    // Keep what was typed if the save failed, so nothing is lost.
    if (task) onCreated(task.id)
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <TextField label="Title" value={title} onChange={setTitle} maxLength={MAX_TITLE_CHARS} required data-autofocus />
      <TextField label="Objective" hint="Optional. What done looks like." value={objective} onChange={setObjective} maxLength={MAX_TASK_TEXT_CHARS} multiline />
      <TextField label="Next action" hint="Optional. The first thing the next agent should do." value={nextAction} onChange={setNextAction} maxLength={MAX_TASK_TEXT_CHARS} />
      <SelectField label="When" value={when} onChange={(event) => setWhen(event.target.value as 'now' | 'later')}>
        <option value="now">Start now</option>
        <option value="later">Plan for later</option>
      </SelectField>
      {when === 'now' && paused.length > 0 && <p className="text-[12.5px] text-muted">This pauses {paused.map((task) => `"${task.title}"`).join(', ')}.</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={editor.isSaving || title.trim() === ''}>
          Create task
        </Button>
      </div>
    </form>
  )
}

export function NewTaskDialog({ open, onClose, ...rest }: NewTaskDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="New task" description="Agents see it in their next briefing, labelled as set by you." size="sm">
      <Form onClose={onClose} {...rest} />
    </Dialog>
  )
}
