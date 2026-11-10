import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { MAX_PREFERENCE_CHARS, MAX_PREFERENCES } from '@continuum/core'
import { useSave } from '../../hooks/useSave'
import { useServiceQuery } from '../../hooks/useServiceQuery'
import { continuumService } from '../../services'
import { useIsLive } from '../../state/dataMode'
import { Button } from '../shared/Button'
import { TextField } from '../shared/Fields'
import { Panel } from '../shared/Panel'

/**
 * Your preferences for every repository. They are kept in a file on this
 * machine, outside any repository, and every briefing carries them labelled
 * set by you. Each change is saved at once, through the same write as a task edit.
 */
export function ProfilePanel() {
  const isLive = useIsLive()
  const profile = useServiceQuery('profile', () => continuumService.getProfile())
  const { save, isSaving } = useSave()
  const [draft, setDraft] = useState('')
  const preferences = profile.data?.preferences ?? []
  const isFull = preferences.length >= MAX_PREFERENCES

  const add = async () => {
    const saved = await save(() => continuumService.updateProfile([...preferences, draft]))
    // Keep what was typed if the save failed, so nothing is lost.
    if (saved) setDraft('')
  }
  const remove = (preference: string) => void save(() => continuumService.updateProfile(preferences.filter((candidate) => candidate !== preference)))

  return (
    <Panel title="Your profile" description="Preferences for every repository on this machine, such as “Use pnpm, never npm”. Every agent's briefing carries them, labelled set by you.">
      {profile.error && <p className="text-[13px] text-danger">{profile.error.message}</p>}
      {!profile.error && preferences.length === 0 && !profile.isLoading && <p className="text-[13px] text-muted">No preferences yet.</p>}
      {preferences.length > 0 && (
        <ul className="divide-y divide-line" aria-label="Your preferences">
          {preferences.map((preference) => (
            <li key={preference} className="flex items-start justify-between gap-3 py-2 first:pt-0">
              <span className="min-w-0 text-[13px] break-words text-fg">{preference}</span>
              {isLive && (
                <button type="button" disabled={isSaving} onClick={() => remove(preference)} aria-label={`Remove “${preference}”`} className="shrink-0 rounded p-1 text-subtle hover:text-fg disabled:opacity-50">
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isLive ? (
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <div className="min-w-0 flex-1">
            <TextField label="Add a preference" value={draft} onChange={setDraft} maxLength={MAX_PREFERENCE_CHARS} disabled={isFull} hint={isFull ? `A profile holds at most ${MAX_PREFERENCES}; remove one first.` : 'One sentence. Secrets are masked before it is saved.'} />
          </div>
          <Button size="sm" variant="primary" type="submit" icon={<Plus />} disabled={isSaving || isFull || draft.trim() === ''}>
            Add
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-[12px] text-muted">The demo is read-only. Run continuum serve to keep your own.</p>
      )}
    </Panel>
  )
}
