import type { ContextStore } from '@continuum/store'
import type { CheckSummary, ProjectState } from './projectState'
import { agoFromIso } from './time'

const FILE_PREFIX = 'file:'
/** Changed files named per check; the rest are counted. */
const MAX_NAMED_FILES = 3

export interface UnverifiedCheck {
  check: CheckSummary
  /** False when the task has no recorded files, so every check is listed because none can be ruled out. */
  coversTaskFiles: boolean
}

/**
 * The checks that say a task's work is not verified as it stands: failed, or
 * passed against code that has changed since. A check counts when its latest
 * run covered a file the task touched; for a task with no recorded files
 * (an agent without hooks), every such check counts.
 */
export function unverifiedChecks(store: ContextStore, state: ProjectState, taskId: string): UnverifiedCheck[] {
  const files = new Set(state.tasks.find((task) => task.id === taskId)?.files ?? [])
  const covers = (check: CheckSummary) =>
    Object.keys(store.checkRun(check.name)?.ranAgainst ?? {}).some((key) => key.startsWith(FILE_PREFIX) && files.has(key.slice(FILE_PREFIX.length)))
  return state.checks
    .filter((check) => check.status === 'failed' || check.status === 'out-of-date')
    .filter((check) => files.size === 0 || covers(check))
    .map((check) => ({ check, coversTaskFiles: files.size > 0 }))
}

function describe(check: CheckSummary, now: Date): string {
  const label = check.evidence === 'verified' ? '[verified]' : '[observed: run by an agent]'
  if (check.status === 'failed') return `${label} \`${check.name}\` FAILED${check.exitCode === null ? '' : ` (exit ${check.exitCode})`}, ran ${agoFromIso(check.ranAt, now)}`
  const named = check.changed.slice(0, MAX_NAMED_FILES).join(', ')
  const more = check.changed.length - MAX_NAMED_FILES
  return `${label} \`${check.name}\` is OUT OF DATE: ${named}${more > 0 ? ` and ${more} more` : ''} changed since it ran ${agoFromIso(check.ranAt, now)}`
}

/**
 * What to tell an agent that just marked a task completed while a check says
 * otherwise; null when nothing does. A warning only: the task stays closed.
 */
export function closingWarning(unverified: readonly UnverifiedCheck[], now: Date): string | null {
  if (unverified.length === 0) return null
  const scope = unverified[0].coversTaskFiles ? '' : ' (this task has no recorded files, so every check is listed)'
  const rerun = unverified[0].check
  return [
    `Warning: closed with unverified work${scope}. ${unverified.map(({ check }) => describe(check, now)).join('; ')}.`,
    `The task is still completed. To record a result against the code as it is now, run the check through Continuum, e.g. \`continuum run --name ${rerun.name} -- ${rerun.command}\`, or say in your summary that it is unverified.`,
  ].join(' ')
}
