import { Plus } from 'lucide-react'
import { useState } from 'react'
import { MAX_MEMORY_BODY_CHARS, MAX_TITLE_CHARS, MEMORY_KIND_LABEL, type MemoryRecord, type NewMemoryKind } from '@continuum/core'
import type { ProjectEditor } from '../../hooks/useProjectEditor'
import { Button } from '../shared/Button'
import { SelectField, TextField } from '../shared/Fields'

const KINDS: NewMemoryKind[] = ['decision', 'known-issue']

/** `taskId`: the task on screen. Without one the record belongs to the project as a whole. */
export function AddMemory({ editor, taskId }: { editor: ProjectEditor; taskId?: string }) {
  const [isOpen, setOpen] = useState(false)
  const [kind, setKind] = useState<NewMemoryKind>('decision')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  if (!isOpen) {
    return (
      <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setOpen(true)}>
        Add a decision or issue
      </Button>
    )
  }

  const close = () => {
    setTitle('')
    setBody('')
    setOpen(false)
  }

  const submit = async () => {
    const saved = await editor.addMemory({ kind, title, ...(body.trim() ? { body } : {}), ...(taskId ? { taskId } : {}) })
    // Keep what was typed if the save failed, so nothing is lost.
    if (saved) close()
  }

  return (
    <form
      className="space-y-3 rounded-md border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <SelectField label="Kind" value={kind} onChange={(event) => setKind(event.target.value as NewMemoryKind)}>
        {KINDS.map((option) => (
          <option key={option} value={option}>
            {MEMORY_KIND_LABEL[option]}
          </option>
        ))}
      </SelectField>
      <TextField label="Title" value={title} onChange={setTitle} maxLength={MAX_TITLE_CHARS} required autoFocus />
      <TextField label="Details" hint="Optional. Why, or what to watch for." value={body} onChange={setBody} maxLength={MAX_MEMORY_BODY_CHARS} multiline />
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={close}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={editor.isSaving || title.trim() === ''}>
          Add
        </Button>
      </div>
    </form>
  )
}

const REVIEW_ACTION = 'text-[12px] text-muted underline decoration-line-strong underline-offset-2 hover:text-fg disabled:opacity-50'

/** Your verdict on a record. A resolved one can only be reopened; "still valid" is what reopens it. */
export function ReviewActions({ record, editor }: { record: MemoryRecord; editor: ProjectEditor }) {
  const review = (verdict: 'resolved' | 'still-valid') => void editor.reviewMemory(record.id, verdict)
  if (record.review === 'resolved') {
    return (
      <button type="button" disabled={editor.isSaving} onClick={() => review('still-valid')} className={REVIEW_ACTION} aria-label={`Reopen "${record.title}"`}>
        Reopen
      </button>
    )
  }
  return (
    <div className="flex gap-3">
      <button type="button" disabled={editor.isSaving} onClick={() => review('still-valid')} className={REVIEW_ACTION} aria-label={`Mark "${record.title}" as still valid`}>
        Still valid
      </button>
      <button type="button" disabled={editor.isSaving} onClick={() => review('resolved')} className={REVIEW_ACTION} aria-label={`Mark "${record.title}" as resolved`}>
        Resolved
      </button>
    </div>
  )
}
