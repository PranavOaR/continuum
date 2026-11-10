import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MAX_REDACT_PATTERNS, MAX_REDACTION_SAMPLE_CHARS, type RedactionPreview, type RepositorySettings } from '@continuum/core'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useSave } from '../../hooks/useSave'
import { useServiceQuery } from '../../hooks/useServiceQuery'
import { useProjects, usePreferredProjectId } from '../../hooks/useWorkspace'
import { continuumService } from '../../services'
import { Button } from '../shared/Button'
import { SelectField, TextField, Toggle } from '../shared/Fields'
import { Panel } from '../shared/Panel'

const PREVIEW_DELAY_MS = 300
/** The longest pattern a repository accepts; the server says so too. */
const MAX_PATTERN_CHARS = 200

const SWITCHES: { key: 'agentChecks' | 'capturePrompts' | 'receipts'; label: string; description: string }[] = [
  { key: 'agentChecks', label: 'Record checks agents run', description: 'Tests, lint and builds an agent runs, with the exit code it observed.' },
  { key: 'capturePrompts', label: 'Record your prompts', description: 'What you type to agents, redacted. Off unless you turn it on.' },
  { key: 'receipts', label: 'Receipts', description: 'One line after a Claude Code reply that recorded something.' },
]

/** What the patterns saved, plus the one being typed, would mask in the sample; asked of the local server after a pause in typing. */
function usePreview(projectId: string, patterns: readonly string[], sample: string): RedactionPreview | undefined {
  const request = useDebouncedValue(JSON.stringify({ projectId, patterns, sample }), PREVIEW_DELAY_MS)
  const [preview, setPreview] = useState<{ request: string; result: RedactionPreview } | undefined>(undefined)
  useEffect(() => {
    const asked = JSON.parse(request) as { projectId: string; patterns: string[]; sample: string }
    if (asked.sample === '' && asked.patterns.length === 0) return
    let isCancelled = false
    continuumService.previewRedaction(asked.projectId, asked.patterns, asked.sample).then(
      (result) => {
        if (!isCancelled) setPreview({ request, result })
      },
      // A preview that fails says nothing; saving reports its own errors.
      () => {},
    )
    return () => {
      isCancelled = true
    }
  }, [request])
  return preview?.request === request ? preview.result : undefined
}

function Patterns({ projectId, settings, isSaving, change }: { projectId: string; settings: RepositorySettings; isSaving: boolean; change: (next: Partial<RepositorySettings>) => Promise<RepositorySettings | null> }) {
  const [draft, setDraft] = useState('')
  const [sample, setSample] = useState('')
  const typed = draft.trim()
  const patterns = typed === '' ? settings.redactPatterns : [...settings.redactPatterns, typed]
  const preview = usePreview(projectId, patterns, sample)
  const refusal = preview?.refused.find((entry) => entry.pattern === typed)
  const isFull = settings.redactPatterns.length >= MAX_REDACT_PATTERNS

  const add = async () => {
    const saved = await change({ redactPatterns: patterns })
    // Keep what was typed if it was refused, with the reason on screen.
    if (saved) setDraft('')
  }

  return (
    <div className="space-y-4 pt-4">
      <div>
        <p className="text-[13px] font-medium text-fg">Redaction patterns</p>
        <p className="text-[12px] text-muted">Regular expressions masked before anything is stored, on top of the built-in rules for keys and tokens: a customer or ticket id, say.</p>
      </div>
      {settings.redactPatterns.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line" aria-label="Redaction patterns">
          {settings.redactPatterns.map((pattern) => (
            <li key={pattern} className="flex items-center justify-between gap-3 px-3 py-2">
              <code className="min-w-0 font-mono text-[12px] break-all text-fg">{pattern}</code>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void change({ redactPatterns: settings.redactPatterns.filter((candidate) => candidate !== pattern) })}
                aria-label={`Remove the pattern ${pattern}`}
                className="shrink-0 rounded p-1 text-subtle hover:text-fg disabled:opacity-50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <TextField label="New pattern" value={draft} onChange={setDraft} maxLength={MAX_PATTERN_CHARS} disabled={isFull} hint={isFull ? `A repository holds at most ${MAX_REDACT_PATTERNS}; remove one first.` : 'For example ACME-[0-9]{6}'} />
        <TextField label="Try it on a sample" value={sample} onChange={setSample} maxLength={MAX_REDACTION_SAMPLE_CHARS} multiline hint="Paste text like what you want masked. It is sent only to Continuum on this machine, and is not stored." />
        {refusal && (
          <p role="alert" className="text-[13px] text-danger">
            This pattern cannot be used. {refusal.reason}
          </p>
        )}
        {preview && sample !== '' && (
          <div>
            <p className="label-mono text-subtle">
              As it would be stored ({preview.count} masked)
            </p>
            <pre aria-label="Sample as it would be stored" className="mt-1.5 max-h-40 overflow-auto rounded-md border border-line bg-surface-2 p-3 font-mono text-[12px] break-all whitespace-pre-wrap text-fg">
              {preview.masked}
            </pre>
          </div>
        )}
        <div className="flex justify-end">
          <Button size="sm" variant="primary" type="submit" icon={<Plus />} disabled={isSaving || isFull || typed === '' || refusal !== undefined || settings.redactPatterns.includes(typed)}>
            Add pattern
          </Button>
        </div>
      </form>
    </div>
  )
}

/**
 * One repository's settings, as `continuum config` and .continuum/config.json
 * hold them. Each change is saved at once, through the same write as a task
 * edit; a pattern that cannot be used is refused with its reason.
 */
export function RepositorySettingsPanel() {
  const projects = useProjects()
  const preferred = usePreferredProjectId()
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const projectId = chosen ?? preferred
  const settings = useServiceQuery(projectId ? `settings:${projectId}` : null, () => continuumService.getSettings(projectId as string))
  const { save, isSaving } = useSave()
  if (!projectId) return null
  const change = (next: Partial<RepositorySettings>) => save(() => continuumService.updateSettings(projectId, next))

  return (
    <Panel id="repository-settings" title="Repository settings" description="What Continuum records in one repository, and what it masks first. Kept in that repository's .continuum folder, never committed.">
      <SelectField label="Repository" value={projectId} onChange={(event) => setChosen(event.target.value)}>
        {(projects.data ?? []).map(({ project }) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </SelectField>
      {settings.error && <p className="mt-4 text-[13px] text-danger">{settings.error.message}</p>}
      {settings.data && (
        <div className="mt-4 divide-y divide-line">
          <div className="space-y-4 pb-4">
            {SWITCHES.map(({ key, label, description }) => (
              <Toggle key={key} label={label} description={description} checked={settings.data?.[key] ?? false} onChange={(checked) => void change({ [key]: checked })} />
            ))}
          </div>
          <Patterns key={projectId} projectId={projectId} settings={settings.data} isSaving={isSaving} change={change} />
        </div>
      )}
    </Panel>
  )
}
