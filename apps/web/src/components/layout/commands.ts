import { ArrowRightLeft, FolderOpen, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '../../hooks/useWorkspace'
import { usePreferences } from '../../state/preferences'
import { useUI } from '../../state/ui'
import { NAV_ITEMS } from './navItems'

export type CommandGroup = 'Go to' | 'Projects' | 'Actions'

export interface Command {
  id: string
  group: CommandGroup
  label: string
  icon: LucideIcon
  /** Extra words a query may match, e.g. "theme" for the theme switch. */
  keywords?: string
  run: () => void
}

/** The theme on screen, which "system" resolves to light or dark. */
const shownTheme = (): 'light' | 'dark' => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')

/** What the command palette offers besides search results: every page, every project, and the common actions. */
export function useCommands(): Command[] {
  const navigate = useNavigate()
  const { openHandoffDialog } = useUI()
  const { updatePreferences } = usePreferences()
  const { data: projects } = useProjects()

  return useMemo(() => {
    const pages: Command[] = NAV_ITEMS.map(({ to, label, icon }) => ({ id: `page:${to}`, group: 'Go to', label, icon, run: () => navigate(to) }))
    const projectLinks: Command[] = (projects ?? []).map(({ project }) => ({
      id: `project:${project.id}`,
      group: 'Projects',
      label: project.name,
      icon: FolderOpen,
      keywords: project.repositoryName,
      run: () => navigate(`/app/projects/${project.id}`),
    }))
    const isDark = shownTheme() === 'dark'
    const actions: Command[] = [
      { id: 'action:handoff', group: 'Actions', label: 'Prepare a handoff', icon: ArrowRightLeft, keywords: 'briefing agent', run: () => openHandoffDialog() },
      {
        id: 'action:theme',
        group: 'Actions',
        label: isDark ? 'Switch to light theme' : 'Switch to dark theme',
        icon: isDark ? Sun : Moon,
        keywords: 'theme appearance mode',
        run: () => updatePreferences({ theme: isDark ? 'light' : 'dark' }),
      },
    ]
    return [...pages, ...projectLinks, ...actions]
  }, [navigate, openHandoffDialog, updatePreferences, projects])
}

/** Commands whose label or keywords contain every word of the query, in any order. */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return commands.filter((command) => {
    const text = `${command.label} ${command.keywords ?? ''} ${command.group}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}
