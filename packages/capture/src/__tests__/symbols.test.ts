import { describe, expect, it } from 'vitest'
import { extractSymbols } from '../symbols'

const TS = `import { db } from './db'

/** Signs a user in. */
export async function login(email: string) {
  const greeting = \`hello \${email} {not a brace}\`
  const pattern = /\\{[a-z]+\\}/
  // a comment with } and {
  function helper() {
    return '}'
  }
  return db.find(email, helper(), greeting, pattern)
}

export class Session {
  constructor(readonly id: string) {}
}

export interface User {
  email: string
}

export type Role = 'admin' | 'member'

export const LIMITS = {
  attempts: 3,
  window: 60,
}

enum Level {
  Low,
}
`

describe('extractSymbols for TypeScript', () => {
  it('finds top-level declarations and ignores nested ones and braces inside strings, templates, regexes and comments', () => {
    const symbols = extractSymbols('src/auth.ts', TS)
    expect(symbols?.map((symbol) => [symbol.name, symbol.kind])).toEqual([
      ['login', 'function'],
      ['Session', 'class'],
      ['User', 'interface'],
      ['Role', 'type'],
      ['LIMITS', 'variable'],
      ['Level', 'enum'],
    ])
    expect(symbols?.[0]).toMatchObject({ startLine: 3, endLine: 12 })
  })

  it('changes only the hash of the declaration that was edited', () => {
    const before = extractSymbols('src/auth.ts', TS)
    const after = extractSymbols('src/auth.ts', TS.replace('attempts: 3', 'attempts: 5'))
    const changed = before?.filter((symbol, index) => symbol.hash !== after?.[index].hash).map((symbol) => symbol.name)
    expect(changed).toEqual(['LIMITS'])
  })

  it('ignores whitespace-only differences at line ends', () => {
    expect(extractSymbols('a.ts', 'export function f() {\n  return 1\n}\n')?.[0].hash).toBe(extractSymbols('a.ts', 'export function f() {   \n  return 1\n}\n\n')?.[0].hash)
  })

  it('refuses files whose brackets do not balance, and unknown languages', () => {
    expect(extractSymbols('broken.ts', 'export function f() {\n  if (x) {\n')).toBeNull()
    expect(extractSymbols('notes.md', '# Title')).toBeNull()
  })
})

describe('extractSymbols for Python', () => {
  const PY = `import os

LIMIT = 3

@cache
def load(path):
    if path:
        return os.read(path)

class Store:
    """A store.

Not indented on purpose.
    """
    def get(self):
        return 1
`

  it('finds top-level functions, classes and constants, keeping decorators with their function', () => {
    const symbols = extractSymbols('app/store.py', PY)
    expect(symbols?.map((symbol) => [symbol.name, symbol.kind, symbol.startLine])).toEqual([
      ['LIMIT', 'variable', 3],
      ['load', 'function', 5],
      ['Store', 'class', 10],
    ])
  })
})

describe('extractSymbols on real code', () => {
  it('reads every TypeScript and TSX file in this repository', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(__dirname, '../../../..')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (['node_modules', 'dist', 'coverage', 'test-results'].includes(name)) continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name)) files.push(path)
      }
    }
    for (const dir of ['packages', 'apps']) walk(join(root, dir))
    const unreadable = files.filter((file) => extractSymbols(file, readFileSync(file, 'utf8')) === null).map((file) => file.slice(root.length + 1))
    expect(files.length).toBeGreaterThan(200)
    expect(unreadable).toEqual([])
  })
})
