import { describe, expect, it } from 'vitest'
import { fetchProblemReport, NEW_ISSUE_URL, reportLink } from '../services/problemReport'

const FILLED = 'https://github.com/PranavOaR/continuum-plugin/issues/new?template=bug_report.md&body=report'
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('reportLink', () => {
  it('is the pre-filled issue when the local server built a report', () => {
    expect(reportLink({ markdown: 'report', issueUrl: FILLED })).toBe(FILLED)
  })

  it('is the plain new-issue page without a report, or when the link leads anywhere else', () => {
    expect(reportLink(undefined)).toBe(NEW_ISSUE_URL)
    expect(reportLink({ markdown: 'report', issueUrl: 'https://example.com/issues/new?body=report' })).toBe(NEW_ISSUE_URL)
  })
})

describe('fetchProblemReport', () => {
  it('returns the report the local server built', async () => {
    expect(await fetchProblemReport(reply(200, { data: { markdown: 'report', issueUrl: FILLED } }))).toEqual({ markdown: 'report', issueUrl: FILLED })
  })

  it('fails when the server has none or sends something else', async () => {
    await expect(fetchProblemReport(reply(404, { error: { code: 'not-found' } }))).rejects.toThrow(/404/)
    await expect(fetchProblemReport(reply(200, { data: { markdown: 1 } }))).rejects.toThrow(/could not build/)
  })
})
