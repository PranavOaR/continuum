import { describe, expect, it } from 'vitest'
import { REDACTED, redactSecrets, redactWithCount, setCustomRedactions } from '../redact'

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
    [`stripe ${fake('sk', '_live_', 'x'.repeat(24))}`, 'stripe [redacted]'],
    [`key:\n${fake('-----BEGIN ', 'RSA PRIVATE KEY-----')}\nMIIEabc\ndef\n${fake('-----END ', 'RSA PRIVATE KEY-----')}\ndone`, 'key:\n[redacted]\ndone'],
    [`cut off ${fake('-----BEGIN ', 'PRIVATE KEY-----')}\nMIIEabc`, 'cut off [redacted]'],
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

describe('redactSecrets, stronger rules', () => {
  // Generated, high-entropy fakes in the shapes real providers use.
  const random = (length: number) => fake(...Array.from({ length }, (_, index) => 'aB3xK9mQ2zR7tW5pL8nV4cY6hD1fG0sJ'[(index * 7 + 3) % 32]))
  it.each([
    ['google', `key=${fake('AI', 'za')}${random(35)}`],
    ['gitlab', `${fake('gl', 'pat-')}${random(20)}`],
    ['stripe webhook', `${fake('wh', 'sec_')}${random(32)}`],
    ['sendgrid', `${fake('S', 'G.')}${random(22)}.${random(43)}`],
    ['slack webhook', `${fake('https://hooks.', 'slack.com/services/')}T000/B000/${random(24)}`],
    ['azure', `DefaultEndpointsProtocol=https;AccountKey=${random(40)}==`],
    ['random token', `export SESSION=${random(40)}`],
    ['openssh key', `${fake('-----BEGIN ', 'OPENSSH PRIVATE KEY-----')}\nb3BlbnNzaA\n${fake('-----END ', 'OPENSSH PRIVATE KEY-----')}`],
  ])('catches a %s secret', (_name, input) => {
    expect(redactSecrets(input)).toContain(REDACTED)
  })

  it('counts what it redacted', () => {
    expect(redactWithCount(`API_KEY=${VALUE} and Bearer ${VALUE}`)).toEqual({ text: 'API_KEY=[redacted] and Bearer [redacted]', count: 2 })
    expect(redactWithCount('nothing here').count).toBe(0)
  })

  it('leaves hashes, paths and identifiers alone', () => {
    const ordinary = [
      'commit 9fceb02d0ae598e95dc970b74767f19372d61af8',
      'blob 3066bea84d1f25460402b5c1dad2a0b1f28e580190a883070cc2c1614bc1fea1',
      'packages/claude-code/src/__tests__/ingest.test.ts',
      'const handleMultipleSelectionChangeEventForDropdown = () => {}',
      'id 123e4567-e89b-12d3-a456-426614174000',
      'https://github.com/PranavOaR/continuum/pull/12',
      'const csrfToken = options.csrfToken ?? createAccessToken()',
      'password = process.env.DB_PASSWORD',
      "export const TOKEN_ENV = 'CONTINUUM_SERVE_TOKEN'",
    ].join('\n')
    expect(redactSecrets(ordinary)).toBe(ordinary)
  })

  it('applies custom patterns from the repository config, skipping invalid ones', () => {
    expect(setCustomRedactions(['ACME-[0-9]{6}', '(unclosed'])).toBe(1)
    expect(redactSecrets('ticket ACME-123456 opened')).toBe('ticket [redacted] opened')
    setCustomRedactions([])
  })
})

describe('false positives on real code', () => {
  it('redacts nothing in this repository’s own source files', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(__dirname, '../../../..')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (['node_modules', 'dist', '__tests__', 'coverage', 'e2e', 'test-results'].includes(name)) continue
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx|md|json)$/.test(name) && !name.endsWith('redact.ts') && name !== 'package-lock.json') files.push(path)
      }
    }
    for (const dir of ['packages', 'apps', 'docs', 'scripts']) walk(join(root, dir))
    const hits = files.flatMap((file) => {
      const { count } = redactWithCount(readFileSync(file, 'utf8'))
      return count > 0 ? [`${file.slice(root.length + 1)}: ${count}`] : []
    })
    expect(files.length).toBeGreaterThan(100)
    expect(hits).toEqual([])
  })
})

describe('redactSecrets robustness', () => {
  it.each([
    ['repeated secret names', 'token.'.repeat(5_000)],
    ['a long run of letters after a scheme', `x://${'a'.repeat(50_000)}`],
    ['one huge line', 'A1b2'.repeat(100_000)],
  ])('stays fast on pathological input: %s', (_name, input) => {
    const started = performance.now()
    redactSecrets(input)
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  it.each([
    ['a JSON password', `{"password":"${VALUE}"}`, '{"password":"[redacted]"}'],
    ['a JSON client secret', `{"client_secret": "${VALUE}"}`, '{"client_secret": "[redacted]"}'],
    ['pass=', `pass=${VALUE}`, 'pass=[redacted]'],
    ['a quoted lowercase snake-case password', `password: 'correct_horse_battery'`, "password: '[redacted]'"],
    ['curl -u', `curl -u admin:${VALUE} https://example.com`, 'curl -u admin:[redacted] https://example.com'],
    ['a raw Authorization header', `Authorization: ${VALUE}x9`, 'Authorization: [redacted]'],
    ['a URL password with @ and /', `postgres://user:p@ss/word@db.internal:5432/app`, 'postgres://[redacted]@db.internal:5432/app'],
  ])('catches %s', (_name, input, expected) => {
    expect(redactSecrets(input)).toBe(expected)
  })

  it('refuses overly long custom patterns', () => {
    expect(setCustomRedactions(['a'.repeat(500)])).toBe(0)
  })
})
