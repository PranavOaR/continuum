import { describe, expect, it } from 'vitest'
import { REDACTED, redactSecrets } from '../redact'

// Fake credentials are assembled at runtime so secret scanners never see a literal one in the repo.
const fake = (...parts: string[]) => parts.join('')
const VALUE = fake('not', '-a-', 'real', '-value')
const JWT = [fake('ey', 'JfYWtlIjoiaGVhZGVyIn0'), fake('ey', 'JmYWtlIjoiYm9keSJ9'), fake('ZmFrZS', '1zaWc')].join('.')

describe('redactSecrets', () => {
  it.each([
    [`API_KEY=${VALUE}`, 'API_KEY=[redacted]'],
    [`export GITHUB_TOKEN="${VALUE}"`, 'export GITHUB_TOKEN="[redacted]"'],
    [`db_password: ${VALUE}`, 'db_password: [redacted]'],
    [`deploy --token ${VALUE} --env prod`, 'deploy --token [redacted] --env prod'],
    [`deploy --api-key=${VALUE}`, 'deploy --api-key=[redacted]'],
    [`curl -H "Authorization: Bearer ${VALUE}"`, 'curl -H "Authorization: Bearer [redacted]"'],
    [`clone https://user:${VALUE}@example.com/x/y.git`, 'clone https://[redacted]@example.com/x/y.git'],
    [`token ${fake('gh', 'p_', 'x'.repeat(36))} leaked`, 'token [redacted] leaked'],
    [`key ${fake('sk', '-', 'x'.repeat(24))}`, 'key [redacted]'],
    [`aws ${fake('AK', 'IA', 'X'.repeat(16))}`, 'aws [redacted]'],
    [`slack ${fake('xo', 'xb-', '0'.repeat(10), '-', 'x'.repeat(10))}`, 'slack [redacted]'],
    [`jwt ${JWT}`, 'jwt [redacted]'],
  ])('redacts case %#', (input, expected) => {
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
