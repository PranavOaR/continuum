import { HardDrive, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '../components/shared/Button'
import { ConfirmDialog } from '../components/shared/Dialog'
import { Checkbox, SelectField, Toggle } from '../components/shared/Fields'
import { PageHeader } from '../components/shared/PageHeader'
import { Panel } from '../components/shared/Panel'
import { AGENTS } from '@continuum/core'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useProjects, usePreferredProjectId } from '../hooks/useWorkspace'
import { useHandoffs } from '../state/handoffs'
import { usePreferences, type ThemePreference } from '../state/preferences'
import { useToast } from '../state/toasts'
import type { AgentType, ContextCategory } from '@continuum/core'
import { cn } from '../utils/cn'
import { CONTEXT_CATEGORIES } from '@continuum/core'
import { useIsLive } from '../state/dataMode'

const THEMES: { id: ThemePreference; label: string; icon: ReactNode }[] = [
  { id: 'dark', label: 'Dark', icon: <Moon /> },
  { id: 'light', label: 'Light', icon: <Sun /> },
  { id: 'system', label: 'System', icon: <Monitor /> },
]

type ResetAction = 'mock-data' | 'handoffs' | 'everything'

const RESET_COPY: Record<ResetAction, { title: string; description: string; confirm: string; done: string }> = {
  'mock-data': {
    title: 'Reset mock data?',
    description: 'Restores the sample handoff records and their original statuses. Handoffs you created will be removed.',
    confirm: 'Reset mock data',
    done: 'Mock data restored to the original sample.',
  },
  handoffs: {
    title: 'Clear handoff history?',
    description: 'Removes every handoff, including the sample records. You can restore the samples with “Reset mock data”.',
    confirm: 'Clear history',
    done: 'Handoff history cleared.',
  },
  everything: {
    title: 'Restore the default demo state?',
    description: 'Resets preferences, theme, and all handoff data to how the demo first loaded.',
    confirm: 'Restore defaults',
    done: 'Demo restored to its default state.',
  },
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[13px] font-medium text-fg">{label}</p>
        {description && <p className="text-[12px] text-muted">{description}</p>}
      </div>
      <div className="sm:w-64">{children}</div>
    </div>
  )
}

export function SettingsPage() {
  const isLive = useIsLive()
  useDocumentTitle('Settings')
  const { preferences, updatePreferences, resetPreferences } = usePreferences()
  const preferredProjectId = usePreferredProjectId()
  const { restoreSeedData, clearHistory } = useHandoffs()
  const projects = useProjects()
  const notify = useToast()
  const [pendingReset, setPendingReset] = useState<ResetAction | null>(null)

  const runReset = (action: ResetAction) => {
    if (action === 'mock-data') restoreSeedData()
    if (action === 'handoffs') clearHistory()
    if (action === 'everything') {
      restoreSeedData()
      resetPreferences()
    }
    notify(RESET_COPY[action].done)
  }

  const toggleContext = (category: ContextCategory, checked: boolean) =>
    updatePreferences({
      defaultContext: checked ? [...preferences.defaultContext, category] : preferences.defaultContext.filter((item) => item !== category),
    })

  const setSource = (agent: AgentType) =>
    updatePreferences({
      preferredSourceAgent: agent,
      preferredTargetAgent: agent === preferences.preferredTargetAgent ? (AGENTS.find((a) => a.id !== agent)?.id ?? 'other') : preferences.preferredTargetAgent,
    })

  return (
    <>
      <PageHeader title="Settings" description="Preferences are stored in this browser only." crumbs={[{ label: 'Overview', to: '/app' }, { label: 'Settings' }]} />

      <div className="grid max-w-3xl gap-6">
        <Panel title="General">
          <div className="divide-y divide-line">
            <SettingRow label="Theme" description="Dark is the default.">
              <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-md border border-line p-0.5">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    role="radio"
                    aria-checked={preferences.theme === theme.id}
                    onClick={() => updatePreferences({ theme: theme.id })}
                    className={cn(
                      'flex h-8 items-center justify-center gap-1.5 rounded text-[12px] [&_svg]:size-3.5',
                      preferences.theme === theme.id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    {theme.icon}
                    {theme.label}
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Default project" description="Opened by “Open Project” and preselected in handoffs.">
              <SelectField label="Default project" hideLabel value={preferredProjectId ?? ''} onChange={(event) => updatePreferences({ defaultProjectId: event.target.value })}>
                {(projects.data ?? []).map(({ project }) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectField>
            </SettingRow>
            <div className="space-y-4 pt-4">
              <Toggle
                label="Relative timestamps"
                description="Show “26 min ago” instead of a date and time."
                checked={preferences.relativeTimestamps}
                onChange={(relativeTimestamps) => updatePreferences({ relativeTimestamps })}
              />
              <Toggle
                label="Reduce motion"
                description="Disable interface animations. Your system setting is always respected."
                checked={preferences.reduceMotion}
                onChange={(reduceMotion) => updatePreferences({ reduceMotion })}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Agent preferences" description="Defaults used when you prepare a handoff.">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Preferred source agent" value={preferences.preferredSourceAgent} onChange={(event) => setSource(event.target.value as AgentType)}>
              {AGENTS.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Preferred target agent"
              value={preferences.preferredTargetAgent}
              onChange={(event) => updatePreferences({ preferredTargetAgent: event.target.value as AgentType })}
            >
              {AGENTS.filter((agent) => agent.id !== preferences.preferredSourceAgent).map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </SelectField>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2 text-[12px] font-medium text-muted">Default handoff context</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CONTEXT_CATEGORIES.map((category) => (
                <Checkbox
                  key={category.id}
                  checked={preferences.defaultContext.includes(category.id)}
                  onChange={(checked) => toggleContext(category.id, checked)}
                  label={category.label}
                  hint={category.hint}
                />
              ))}
            </div>
          </fieldset>
        </Panel>

        <Panel title="Privacy and architecture">
          <div className="flex gap-3">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <div className="space-y-2 text-[13px] text-muted">
              <p className="font-medium text-fg">Local-first architecture</p>
              <p>
                Continuum is designed to index and retrieve project context on your machine, without requiring external AI APIs. Agent integrations
                would read and write through local adapters.
              </p>
              {isLive ? (
                <p>
                  <span className="font-medium text-fg">Connected to your local repositories.</span> This dashboard reads Continuum's records from
                  disk through <span className="font-mono">continuum serve</span> on 127.0.0.1; it never writes to them and nothing is sent to any
                  server. Preferences and handoff history are kept in this browser's local storage.
                </p>
              ) : (
                <p>
                  <span className="font-medium text-fg">This prototype uses mock data only.</span> No project files are monitored, no repository is
                  read, no tests are run, and nothing is sent to any agent or server. Preferences and handoff history are kept in this browser's local
                  storage.
                </p>
              )}
            </div>
          </div>
        </Panel>

        <Panel title={isLive ? 'Browser data' : 'Demo controls'} description={isLive ? 'Data this browser keeps for the dashboard.' : 'Return the demo to a known state.'}>
          <div className="divide-y divide-line">
            {!isLive && (
              <SettingRow label="Reset mock data" description="Restore the sample handoffs and statuses.">
                <Button size="sm" icon={<RotateCcw />} onClick={() => setPendingReset('mock-data')} className="w-full">
                  Reset mock data
                </Button>
              </SettingRow>
            )}
            <SettingRow label="Reset handoff history" description="Remove every handoff record.">
              <Button size="sm" variant="danger" onClick={() => setPendingReset('handoffs')} className="w-full">
                Clear handoff history
              </Button>
            </SettingRow>
            {!isLive && (
              <SettingRow label="Restore default demo state" description="Preferences and data back to first load.">
                <Button size="sm" variant="danger" onClick={() => setPendingReset('everything')} className="w-full">
                  Restore defaults
                </Button>
              </SettingRow>
            )}
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={pendingReset !== null}
        title={pendingReset ? RESET_COPY[pendingReset].title : ''}
        description={pendingReset ? RESET_COPY[pendingReset].description : ''}
        confirmLabel={pendingReset ? RESET_COPY[pendingReset].confirm : ''}
        onConfirm={() => pendingReset && runReset(pendingReset)}
        onClose={() => setPendingReset(null)}
      />
    </>
  )
}
