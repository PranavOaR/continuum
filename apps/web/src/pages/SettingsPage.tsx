import { ExternalLink, HardDrive, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '../components/shared/Button'
import { buttonClass } from '../components/shared/buttonClass'
import { ConfirmDialog } from '../components/shared/Dialog'
import { SelectField, Toggle } from '../components/shared/Fields'
import { PageHeader } from '../components/shared/PageHeader'
import { ProfilePanel } from '../components/settings/ProfilePanel'
import { Panel } from '../components/shared/Panel'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useServiceQuery } from '../hooks/useServiceQuery'
import { useProjects, usePreferredProjectId } from '../hooks/useWorkspace'
import { fetchProblemReport, reportLink } from '../services/problemReport'
import { usePreferences, type ThemePreference } from '../state/preferences'
import { useToast } from '../state/toasts'
import { cn } from '../utils/cn'
import { useIsLive } from '../state/dataMode'

const THEMES: { id: ThemePreference; label: string; icon: ReactNode }[] = [
  { id: 'dark', label: 'Dark', icon: <Moon /> },
  { id: 'light', label: 'Light', icon: <Sun /> },
  { id: 'system', label: 'System', icon: <Monitor /> },
]

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

/** A plain link, so the browser opens it as a click and no pop-up blocker steps in. */
function ReportProblem() {
  const isLive = useIsLive()
  const report = useServiceQuery(isLive ? 'problem-report' : null, () => fetchProblemReport())
  const isFilled = report.data !== undefined && reportLink(report.data) === report.data.issueUrl
  const description = isFilled
    ? 'Opens a new issue on GitHub with a diagnostic report filled in: versions, settings and counts, with your paths shortened and secrets masked. None of your code, prompts, tasks or decisions. Nothing is submitted until you press the button there.'
    : 'Opens a new issue on GitHub. Include the output of `continuum doctor --report`, which shortens your paths and masks secrets.'
  return (
    <SettingRow label="Report a problem" description={description}>
      <a href={reportLink(report.data)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm', 'w-full')}>
        <ExternalLink aria-hidden />
        Report a problem
      </a>
    </SettingRow>
  )
}

export function SettingsPage() {
  const isLive = useIsLive()
  useDocumentTitle('Settings')
  const { preferences, updatePreferences, resetPreferences } = usePreferences()
  const preferredProjectId = usePreferredProjectId()
  const projects = useProjects()
  const notify = useToast()
  const [isConfirmingReset, setConfirmingReset] = useState(false)

  const reset = () => {
    resetPreferences()
    notify('Preferences reset.')
  }

  return (
    <>
      <PageHeader title="Settings" description="Display settings are stored in this browser; your profile is kept on this machine for every repository." crumbs={[{ label: 'Overview', to: '/app' }, { label: 'Settings' }]} />

      <div className="grid max-w-3xl gap-6">
        <Panel title="General">
          <div className="divide-y divide-line">
            <SettingRow label="Theme" description="Light is the default.">
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
            <SettingRow label="Default project" description="Opened by “Open Project” and first on Briefings.">
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

        <ProfilePanel />

        <Panel title="Privacy and architecture">
          <div className="flex gap-3">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <div className="space-y-2 text-[13px] text-muted">
              <p className="font-medium text-fg">Local-first architecture</p>
              <p>
                Continuum records and retrieves project context on your machine, without external AI APIs. Agents read and write it through their hooks
                and the local MCP server.
              </p>
              {isLive ? (
                <p>
                  <span className="font-medium text-fg">Connected to your local repositories.</span> This dashboard reads Continuum's records from
                  disk through <span className="font-mono">continuum serve</span> on 127.0.0.1. It writes only what you change here: tasks, records and your profile,
                  each recorded as set by you. Nothing is sent to any server. Preferences are kept in this browser's local storage.
                </p>
              ) : (
                <p>
                  <span className="font-medium text-fg">This prototype uses mock data only.</span> No project files are monitored, no repository is
                  read, no tests are run, and nothing is sent to any agent or server. Preferences are kept in this browser's local storage.
                </p>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Help">
          <ReportProblem />
        </Panel>

        <Panel title="Browser data" description="What this browser keeps for the dashboard.">
          <SettingRow label="Reset preferences" description="Theme, default project and the rest back to their defaults.">
            <Button size="sm" variant="danger" icon={<RotateCcw />} onClick={() => setConfirmingReset(true)} className="w-full">
              Reset preferences
            </Button>
          </SettingRow>
        </Panel>
      </div>

      <ConfirmDialog
        open={isConfirmingReset}
        title="Reset preferences?"
        description="Puts your theme, default project and the other settings on this page back to their defaults."
        confirmLabel="Reset preferences"
        onConfirm={reset}
        onClose={() => setConfirmingReset(false)}
      />
    </>
  )
}
