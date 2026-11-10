import { describe, expect, it } from 'vitest'
import { ISSUES_URL, issueUrl, MAX_ISSUE_URL_CHARS, pathScrubber, renderReport, type ReportInput } from '../report'

const NOW = new Date('2026-11-02T12:00:00.000Z')

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    version: '0.2.1',
    nodeVersion: '24.1.0',
    platform: 'darwin',
    arch: 'arm64',
    installedAs: 'npx -y getcontinuum@0.2.1',
    pluginEnabled: false,
    generatedAt: NOW,
    findings: [
      { status: 'ok', label: 'Node.js 24.1.0' },
      { status: 'warn', label: 'Dashboard is not built', detail: '/home/ana/continuum/apps/web/dist is missing', fix: 'Run `npm run build`.' },
    ],
    repository: {
      store: { schemaVersion: 4, latestSchemaVersion: 4, events: 12, eventTypes: { 'file.changed': 9, 'check.recorded': 3 }, lastActivity: '2026-11-02T11:00:00.000Z', bytes: 2_621_440 },
      settings: { agentChecks: true, capturePrompts: false, receipts: true, redactPatterns: ['ACME-[0-9]{6}'] },
      hooks: [{ agent: 'claude-code', name: 'Claude Code', health: { lastArrivalAt: '2026-11-02T11:59:00.000Z', lastFailure: null, isFailing: false } }],
    },
    ...overrides,
  }
}

const identity = (text: string) => text

describe('renderReport', () => {
  it('lists the environment, every doctor finding with its fix, and the repository facts', () => {
    const report = renderReport(input(), identity)

    expect(report).toContain('## Continuum diagnostic report')
    expect(report).toContain('- Continuum: 0.2.1')
    expect(report).toContain('- Node.js: 24.1.0')
    expect(report).toContain('- Platform: darwin arm64')
    expect(report).toContain('- Installed as: `npx -y getcontinuum@0.2.1`')
    expect(report).toContain('- Claude Code plugin: not enabled')
    expect(report).toContain('- ✓ Node.js 24.1.0')
    expect(report).toContain('- ! Dashboard is not built (/home/ana/continuum/apps/web/dist is missing)')
    expect(report).toContain('  - Fix: Run `npm run build`.')
    expect(report).toContain('- Store: schema 4 of 4, 12 events, 2.5 MB, last activity 2026-11-02T11:00:00.000Z')
    expect(report).toContain('- Events: check.recorded 3, file.changed 9')
    expect(report).toContain('- Settings: agent checks on, prompts off, receipts on, 1 redaction pattern')
    expect(report).toContain('- Claude Code hooks: last arrived 2026-11-02T11:59:00.000Z, no failure recorded')
  })

  it('counts redaction patterns but never prints them', () => {
    expect(renderReport(input(), identity)).not.toContain('ACME-')
  })

  it('shows a hook failure and says when the store or settings cannot be read', () => {
    const report = renderReport(
      input({
        repository: {
          store: { error: 'file is not a database' },
          settings: { error: 'redactPatterns must be valid regular expressions' },
          hooks: [{ agent: 'codex', name: 'Codex', health: { lastArrivalAt: null, lastFailure: { at: '2026-11-01T09:00:00.000Z', message: 'git could not run' }, isFailing: true } }],
        },
      }),
      identity,
    )
    expect(report).toContain('- Store: could not be read (file is not a database)')
    expect(report).toContain('- Settings: could not be read (redactPatterns must be valid regular expressions)')
    expect(report).toContain('- Codex hooks: never arrived, FAILING since 2026-11-01T09:00:00.000Z: git could not run')
  })

  it('says when doctor ran outside a Continuum repository', () => {
    expect(renderReport(input({ repository: null }), identity)).toContain('No Continuum repository here')
  })

  it('passes everything it prints through the scrubber', () => {
    const report = renderReport(input(), (text) => text.replaceAll('/home/ana', '~'))
    expect(report).toContain('(~/continuum/apps/web/dist is missing)')
    expect(report).not.toContain('/home/ana')
  })
})

describe('pathScrubber', () => {
  it('shortens the repository to <repo> and the home folder to ~, and masks secrets', () => {
    const scrub = pathScrubber({ roots: ['/home/ana/code/secret-app'], home: '/home/ana' })
    expect(scrub('/home/ana/code/secret-app/.claude/settings.local.json and /home/ana/.config/continuum')).toBe('<repo>/.claude/settings.local.json and ~/.config/continuum')
    expect(scrub('failed with GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789')).not.toContain('ghp_')
  })

  it('applies the repository’s own redaction patterns', () => {
    const scrub = pathScrubber({ roots: [], home: '/home/ana', patterns: ['ACME-[0-9]{6}'] })
    expect(scrub('ticket ACME-123456 failed')).toBe('ticket [redacted] failed')
  })
})

describe('issueUrl', () => {
  it('opens a new bug report on the plugin repository with the report already in the body', () => {
    const url = new URL(issueUrl(renderReport(input(), identity)))

    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUES_URL}/new`)
    expect(url.searchParams.get('template')).toBe('bug_report.yml')
    const body = url.searchParams.get('doctor') ?? ''
    expect(body).toContain('## Continuum diagnostic report')
    expect(body).toContain('- Continuum: 0.2.1')
  })

  it('asks for the report to be pasted when it would make the link too long for GitHub', () => {
    const long = renderReport(input({ findings: Array.from({ length: 400 }, (_, index) => ({ status: 'fail' as const, label: `Finding number ${index} with a long label` })) }), identity)
    const url = issueUrl(long)

    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_CHARS)
    const body = new URL(url).searchParams.get('doctor') ?? ''
    expect(body).toContain('continuum doctor --report')
    expect(body).not.toContain('Finding number 399')
  })
})
