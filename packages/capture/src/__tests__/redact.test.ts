import { describe, expect, it } from 'vitest'
import { REDACTED, redactSecrets } from '../redact'

describe('redactSecrets', () => {
  it.each([
    ['API_KEY=abc123def', 'API_KEY=[redacted]'],
    ['export GITHUB_TOKEN="ghx-1234"', 'export GITHUB_TOKEN="[redacted]"'],
    ['db_password: hunter2', 'db_password: [redacted]'],
    ['deploy --token abc123 --env prod', 'deploy --token [redacted] --env prod'],
    ['deploy --api-key=abc123', 'deploy --api-key=[redacted]'],
    ['curl -H "Authorization: Bearer eyJabc.def"', 'curl -H "Authorization: Bearer [redacted]"'],
    ['clone https://user:s3cret@github.com/x/y.git', 'clone https://[redacted]@github.com/x/y.git'],
    ['token ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked', 'token [redacted] leaked'],
    ['key sk-ant-api03-abcdefghijklmnopqrstuv', 'key [redacted]'],
    ['aws AKIAABCDEFGHIJKLMNOP', 'aws [redacted]'],
    ['slack xoxb-1234567890-abcdefghij', 'slack [redacted]'],
    ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl', 'jwt [redacted]'],
  ])('redacts %s', (input, expected) => {
    expect(redactSecrets(input)).toBe(expected)
  })

  it('leaves ordinary test output untouched', () => {
    const output = '✓ src/auth/login.test.ts (4 tests) 12ms\nTests  4 passed (4)\nnpm run test -- --watch=false'
    expect(redactSecrets(output)).toBe(output)
  })

  it('exposes the placeholder it uses', () => {
    expect(REDACTED).toBe('[redacted]')
  })
})
