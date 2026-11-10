import type { Invocation } from '@continuum/claude-code'
import { VERSION } from '../build'
import { runDoctor, type DoctorEnvironment, type FindingStatus } from '../doctor'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'
import { openInBrowser } from '../browser'
import { buildReport, ISSUES_URL, issueUrl } from '../report'
import { WEB_DIST } from './serve'

const MARKS: Record<FindingStatus, string> = { ok: '✓', warn: '!', fail: '✗' }
export const DOCTOR_USAGE = 'Usage: continuum doctor [--report [--open]]'
const REPORT_COMMAND = 'continuum doctor --report --open'

type DoctorMode = 'check' | 'report' | 'open-report'

function parseMode(args: readonly string[]): DoctorMode | null {
  if (args.length === 0) return 'check'
  const flags = new Set(args)
  if (flags.size !== args.length || !flags.has('--report')) return null
  if (flags.size === 1) return 'report'
  return flags.size === 2 && flags.has('--open') ? 'open-report' : null
}

/** Opens a new issue with the report filled in; without a browser, the link is printed to open by hand. */
async function openReport(io: Io, report: string, open: (url: string) => Promise<void>): Promise<void> {
  const url = issueUrl(report)
  io.out('Opening a new issue on GitHub with the scrubbed report filled in. Read it there first: Nothing is submitted until you press the button.')
  try {
    await open(url)
  } catch (error) {
    io.out(`Could not open your browser (${error instanceof Error ? error.message : String(error)}); open this link instead:`)
    io.out(url)
  }
}

/**
 * Diagnoses the install and this repository's Claude Code wiring, with a fix for each problem.
 * `--report` prints a scrubbed Markdown report to attach to an issue instead,
 * and `--report --open` starts that issue in the browser.
 */
export async function doctorCommand(
  io: Io,
  args: readonly string[],
  invocation: Invocation,
  webDist = WEB_DIST,
  open: (url: string) => Promise<void> = (url) => openInBrowser(url, { label: 'Report a problem with Continuum' }),
): Promise<number> {
  const mode = parseMode(args)
  if (mode === null) {
    io.err(`continuum: unknown doctor arguments: ${args.join(' ')}`)
    io.err(DOCTOR_USAGE)
    return EXIT_USAGE
  }
  const env: DoctorEnvironment = { cwd: io.cwd, nodeVersion: process.versions.node, platform: process.platform, invocation, webDist, configDir: io.configDir, claudeConfigDir: io.claudeConfigDir, now: io.now() }
  if (mode !== 'check') {
    // A report is the answer even when checks fail, so it exits 0; printed, it goes to stdout alone, to pipe.
    const report = await buildReport({ ...env, version: VERSION, arch: process.arch })
    if (mode === 'report') io.out(report)
    else await openReport(io, report, open)
    return EXIT_OK
  }
  const findings = await runDoctor(env)
  io.out('Continuum doctor')
  for (const finding of findings) {
    io.out(`  ${MARKS[finding.status]} ${finding.label}${finding.detail ? ` (${finding.detail})` : ''}`)
    if (finding.fix && finding.status !== 'ok') io.out(`      → ${finding.fix}`)
  }
  const failures = findings.filter((finding) => finding.status === 'fail').length
  const warnings = findings.filter((finding) => finding.status === 'warn').length
  io.out('')
  if (failures > 0) {
    io.out(`${failures} problem${failures === 1 ? '' : 's'} to fix${warnings > 0 ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}.`)
    io.out(`If a fix above does not work, report it: \`${REPORT_COMMAND}\` opens a new issue at ${ISSUES_URL} with a scrubbed report filled in (versions, settings and counts, none of your code).`)
  } else io.out(warnings > 0 ? `Working, with ${warnings} warning${warnings === 1 ? '' : 's'}.` : 'Everything looks good.')
  return failures > 0 ? EXIT_FAILURE : EXIT_OK
}
