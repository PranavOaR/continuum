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

describe('extractSymbols edge cases', () => {
  const hashOf = (source: string, name: string) => extractSymbols('a.ts', source)?.find((symbol) => symbol.name === name)?.hash

  it('covers every declaration of an overloaded function, so editing its implementation changes it', () => {
    const source = 'export function f(a: string): void\nexport function f(a: number): void\nexport function f(a: unknown) {\n  return a\n}\n'
    const symbols = extractSymbols('a.ts', source)
    expect(symbols?.map((symbol) => [symbol.name, symbol.startLine, symbol.endLine])).toEqual([['f', 1, 5]])
    expect(hashOf(source.replace('return a', 'return null'), 'f')).not.toBe(hashOf(source, 'f'))
  })

  it('treats a merged interface as one symbol', () => {
    const source = 'interface I {\n  a: string\n}\n\ninterface I {\n  b: number\n}\n'
    expect(hashOf(source.replace('b: number', 'b: string'), 'I')).not.toBe(hashOf(source, 'I'))
  })

  it('credits a multi-line decorator to the class it decorates, not the symbol before it', () => {
    const source = 'export const before = 1\n\n@Component({\n  selector: "app",\n})\nexport class A {}\n'
    const edited = source.replace('"app"', '"main"')
    expect(extractSymbols('a.ts', source)?.find((symbol) => symbol.name === 'A')).toMatchObject({ startLine: 3, endLine: 6 })
    expect(hashOf(edited, 'A')).not.toBe(hashOf(source, 'A'))
    expect(hashOf(edited, 'before')).toBe(hashOf(source, 'before'))
  })

  it('names anonymous default exports "default", never "extends"', () => {
    expect(extractSymbols('a.ts', 'export default class extends Base {}\n')?.map((symbol) => symbol.name)).toEqual(['default'])
    expect(extractSymbols('a.ts', 'export const x = 1\nexport default function () {\n  return 2\n}\n')?.map((symbol) => symbol.name)).toEqual(['x', 'default'])
    expect(extractSymbols('a.ts', 'export default class Named extends Base {}\n')?.map((symbol) => symbol.name)).toEqual(['Named'])
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
