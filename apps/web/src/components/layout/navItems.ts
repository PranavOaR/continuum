import { Activity, ArrowRightLeft, Brain, FolderGit2, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/projects', label: 'Projects', icon: FolderGit2 },
  { to: '/app/activity', label: 'Activity', icon: Activity },
  { to: '/app/memory', label: 'Memory', icon: Brain },
  { to: '/app/handoffs', label: 'Handoffs', icon: ArrowRightLeft },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]
