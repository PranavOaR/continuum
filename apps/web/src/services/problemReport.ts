/** Where problems are reported: the public plugin repository hosts the issues. */
export const ISSUES_URL = 'https://github.com/PranavOaR/continuum-plugin/issues'
export const NEW_ISSUE_URL = `${ISSUES_URL}/new/choose`

export interface ProblemReport {
  markdown: string
  issueUrl: string
}

const isProblemReport = (value: unknown): value is ProblemReport =>
  typeof value === 'object' && value !== null && typeof (value as ProblemReport).markdown === 'string' && typeof (value as ProblemReport).issueUrl === 'string'

/**
 * A link that opens a new issue. With a report from `continuum serve` it is the
 * pre-filled one, and only when that link really leads to the issue tracker;
 * otherwise the plain new-issue page.
 */
export function reportLink(report: ProblemReport | undefined): string {
  return report && report.issueUrl.startsWith(`${ISSUES_URL}/new?`) ? report.issueUrl : NEW_ISSUE_URL
}

/** `continuum doctor --report` for the repository being served, built by the local server when asked. */
export async function fetchProblemReport(fetchImpl: typeof fetch = fetch): Promise<ProblemReport> {
  const response = await fetchImpl('/api/report', { headers: { Accept: 'application/json' } })
  const body = (await response.json()) as { data?: unknown }
  if (!response.ok || !isProblemReport(body.data)) throw new Error(`The local Continuum server could not build a report (${response.status}).`)
  return body.data
}
