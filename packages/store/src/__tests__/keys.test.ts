import { describe, expect, it } from 'vitest'
import { keys, kindOf, normalizePath } from '../keys'

describe('identity keys', () => {
  it('normalises repository paths to posix form without a leading ./', () => {
    expect(normalizePath('./src\\auth//login.ts')).toBe('src/auth/login.ts')
  })

  it('builds keys per node kind', () => {
    expect(keys.file('./src/a.ts')).toBe('file:src/a.ts')
    expect(keys.symbol('src/a.ts', 'run')).toBe('symbol:src/a.ts#run')
    expect(keys.task('t1')).toBe('task:t1')
    expect(keys.check('npm test')).toBe('check:npm test')
  })

  it('reads the kind back from a key', () => {
    expect(kindOf('symbol:src/a.ts#run')).toBe('symbol')
    expect(() => kindOf('nonsense')).toThrow(/Invalid identity key/)
  })
})
