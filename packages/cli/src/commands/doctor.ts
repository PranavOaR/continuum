import type { Invocation } from '@continuum/claude-code'
import { VERSION } from '../build'
import { runDoctor, type DoctorEnvironment, type FindingStatus } from '../doctor'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'
import { buildReport } from '../report'
import { WEB_DIST } from './serve'

const MARKS: Record<FindingStatus, string> = { ok: '✓', warn: '!', fail: '✗' }
export const DOCTOR_USAGE = 'Usage: continuum doctor [--report]'

/**
 * Diagnoses the install and this repository's Claude Code wiring, with a fix for each problem.
 * `--report` prints a scrubbed Markdown report to attach to an issue instead.
 */
export async function doctorCommand(io: Io, args: readonly string[], invocation: Invocation, webDist = WEB_DIST): Promise<number> {
  const isReport = args.length === 1 && args[0] === '--report'
  if (args.length > 0 && !isReport) {
    io.err(`continuum: unknown doctor arguments: ${args.join(' ')}`)
    io.err(DOCTOR_USAGE)
    return EXIT_USAGE
  }
  const env: DoctorEnvironment = { cwd: io.cwd, nodeVersion: process.versions.node, platform: process.platform, invocation, webDist, configDir: io.configDir, claudeConfigDir: io.claudeConfigDir, now: io.now() }
  if (isReport) {
    // A report is the answer even when checks fail, so it exits 0 and prints nothing else.
    io.out(await buildReport({ ...env, version: VERSION, arch: process.arch }))
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
  if (failures > 0) io.out(`${failures} problem${failures === 1 ? '' : 's'} to fix${warnings > 0 ? `, ${warnings} warning${warnings === 1 ? '' : 's'}` : ''}.`)
  else io.out(warnings > 0 ? `Working, with ${warnings} warning${warnings === 1 ? '' : 's'}.` : 'Everything looks good.')
  return failures > 0 ? EXIT_FAILURE : EXIT_OK
}
