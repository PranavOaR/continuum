import type { Invocation } from '@continuum/claude-code'
import { runDoctor, type FindingStatus } from '../doctor'
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, type Io } from '../io'
import { WEB_DIST } from './serve'

const MARKS: Record<FindingStatus, string> = { ok: '✓', warn: '!', fail: '✗' }

/** Diagnoses the install and this repository's Claude Code wiring, with a fix for each problem. */
export async function doctorCommand(io: Io, args: readonly string[], invocation: Invocation, webDist = WEB_DIST): Promise<number> {
  if (args.length > 0) {
    io.err(`continuum: doctor takes no arguments: ${args.join(' ')}`)
    return EXIT_USAGE
  }
  const findings = await runDoctor({ cwd: io.cwd, nodeVersion: process.versions.node, platform: process.platform, invocation, webDist, configDir: io.configDir })
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
