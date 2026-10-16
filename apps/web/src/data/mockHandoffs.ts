import type { Handoff } from '@continuum/core'
import { DAY, HOUR, minutesAgo } from './clock'

/** Seed handoff history. User-created handoffs are added on top of these at runtime. */
export const SEED_HANDOFFS: readonly Handoff[] = [
  {
    id: 'h-billing',
    projectId: 'startup-app',
    taskId: 'task-billing-webhooks',
    sourceAgent: 'codex',
    targetAgent: 'claude-code',
    status: 'copied',
    includedContext: ['current-task', 'file-changes', 'decisions', 'verification', 'next-steps'],
    createdAt: minutesAgo(2 * DAY + 60),
    updatedAt: minutesAgo(2 * DAY + 58),
  },
  {
    id: 'h-ingest',
    projectId: 'analytics-platform',
    taskId: 'task-ingest-retry',
    sourceAgent: 'codex',
    targetAgent: 'claude-code',
    status: 'draft',
    includedContext: ['current-task', 'file-changes', 'decisions', 'previous-attempts', 'verification', 'next-steps'],
    createdAt: minutesAgo(22 * HOUR - 5),
    updatedAt: minutesAgo(22 * HOUR - 5),
  },
  {
    id: 'h-mdx',
    projectId: 'dev-portfolio',
    taskId: 'task-mdx-blog',
    sourceAgent: 'cursor',
    targetAgent: 'chatgpt',
    status: 'prepared',
    includedContext: ['project-overview', 'current-task', 'file-changes', 'verification', 'next-steps'],
    createdAt: minutesAgo(3 * HOUR),
    updatedAt: minutesAgo(3 * HOUR),
  },
]
