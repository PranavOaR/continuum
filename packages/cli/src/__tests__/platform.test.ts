import { describe, expect, it } from 'vitest'
import { setupCommand } from '../commands/setup'
import { checkPlatform } from '../doctor'
import { EXIT_FAILURE } from '../io'
import { TEST_CONFIG_DIR } from './harness'

describe('checkPlatform', () => {
  it('accepts macOS and Linux', () => {
    expect(checkPlatform('darwin').status).toBe('ok')
    expect(checkPlatform('linux').status).toBe('ok')
  })

  it('fails on Windows, pointing at WSL', () => {
    const finding = checkPlatform('win32')
    expect(finding.status).toBe('fail')
    expect(finding.fix).toMatch(/WSL/)
  })
})

describe('setup on Windows', () => {
  it('refuses before writing anything, and says why', async () => {
    const errors: string[] = []
    const io = { cwd: '/nowhere', out: () => {}, err: (line: string) => errors.push(line), now: () => new Date(), configDir: TEST_CONFIG_DIR } as unknown as Parameters<typeof setupCommand>[0]
    const invocation = { command: 'npx', args: ['-y', 'getcontinuum@0.0.0'], portable: true }
    expect(await setupCommand(io, ['claude-code'], invocation, 'win32')).toBe(EXIT_FAILURE)
    expect(errors.join('\n')).toMatch(/Windows is not supported yet.*WSL/s)
  })
})
