import { describe, expect, it } from 'vitest'
import { exitCodeFromError, recognizeCheck } from '../agentCheck'

describe('recognizeCheck', () => {
  it.each([
    ['npm test', 'npm test'],
    ['npm run test:unit -- --run', 'npm run test:unit -- --run'],
    ['pnpm lint', 'pnpm lint'],
    ['npx vitest run src', 'npx vitest run src'],
    ['npx tsc --noEmit', 'npx tsc --noEmit'],
    ['cd packages/api && npm test', 'npm test'],
    ['CI=1 npm test 2>&1', 'npm test'],
    ['python -m pytest -q', 'python -m pytest -q'],
    ['go test ./...', 'go test ./...'],
    ['cargo clippy', 'cargo clippy'],
  ])('recognizes %s', (command, name) => {
    expect(recognizeCheck(command)).toBe(name)
  })

  it.each(['ls -la', 'git status', 'cat package.json', 'npm install', 'npm test | tail -20', 'npm test; echo done', 'npm test || true', 'npm test &', 'echo npm test', 'npm run dev'])(
    'ignores %s',
    (command) => {
      expect(recognizeCheck(command)).toBeNull()
    },
  )
})

describe('exitCodeFromError', () => {
  it('reads the exit code Claude Code reports for a failed command', () => {
    expect(exitCodeFromError('Exit code 1\nFAIL src/a.test.ts')).toBe(1)
    expect(exitCodeFromError('Command timed out')).toBeNull()
    expect(exitCodeFromError(undefined)).toBeNull()
  })
})
