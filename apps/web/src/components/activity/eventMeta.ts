import { FileCode2, FlaskConical, GitCommitHorizontal, Landmark, ListChecks, Terminal, type LucideIcon } from 'lucide-react'
import type { ActivityType } from '@continuum/core'

export const EVENT_ICON: Record<ActivityType, LucideIcon> = {
  'file-change': FileCode2,
  'task-update': ListChecks,
  decision: Landmark,
  'test-result': FlaskConical,
  session: Terminal,
  commit: GitCommitHorizontal,
}
