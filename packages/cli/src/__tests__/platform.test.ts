import { describe, expect, it } from 'vitest'
import { checkPlatform } from '../doctor'

describe('checkPlatform', () => {
  it('accepts Windows, macOS and Linux', () => {
    for (const platform of ['win32', 'darwin', 'linux'] as const) expect(checkPlatform(platform)).toEqual({ status: 'ok', label: `Platform: ${platform}` })
  })
})
