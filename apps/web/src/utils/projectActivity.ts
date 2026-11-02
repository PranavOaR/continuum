import type { ProjectSummary } from '../services'

/** A project worked on within this many days counts as active, task or not. */
export const RECENT_DAYS = 7
const DAY_MS = 86_400_000

/** A task that is still being worked on: in progress, or blocked. */
export const hasOpenTask = (summary: ProjectSummary) => summary.status === 'in-progress' || summary.status === 'blocked'

/**
 * Active means there is work to pick up: an open task, or anything recorded in
 * the last week. Agents often work without a task, and that work still counts.
 */
export function isRecentlyActive(summary: ProjectSummary, now: number = Date.now()): boolean {
  return hasOpenTask(summary) || now - Date.parse(summary.project.updatedAt) <= RECENT_DAYS * DAY_MS
}

/** The active projects, most recently worked on first. */
export function recentProjects(projects: readonly ProjectSummary[], now: number = Date.now()): ProjectSummary[] {
  return projects.filter((summary) => isRecentlyActive(summary, now)).sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt))
}
