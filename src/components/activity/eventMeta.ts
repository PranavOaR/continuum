import { ArrowRightLeft, FileCode2, FlaskConical, Landmark, ListChecks, Terminal, type LucideIcon } from 'lucide-react'
import type { ActivityType } from '../../types'

export const EVENT_ICON: Record<ActivityType, LucideIcon> = {
  'file-change': FileCode2,
  'task-update': ListChecks,
  decision: Landmark,
  'test-result': FlaskConical,
  handoff: ArrowRightLeft,
  session: Terminal,
}
