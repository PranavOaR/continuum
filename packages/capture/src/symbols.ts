import { createHash } from 'node:crypto'

/**
 * Top-level declarations in a source file, each with a hash of its own text,
 * so a decision anchored to `login` goes stale when `login` changes, not when
 * anything else in its file does. Deliberately small and dependency-free:
 * top-level declarations only, and a file it cannot read with confidence
 * (unbalanced brackets, an unknown language) yields no symbols at all, so
 * callers fall back to the whole file instead of trusting a guess.
 */

export type SymbolKind = 'function' | 'class' | 'interface' | 'type' | 'enum' | 'variable'

export interface SourceSymbol {
  name: string
  kind: SymbolKind
  /** First and last line of the declaration, 1-based. */
  startLine: number
  endLine: number
  /** Hash of the declaration's text, ignoring trailing whitespace. */
  hash: string
}

const SCRIPT_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/
const PYTHON_EXTENSIONS = /\.pyi?$/

const SCRIPT_DECLARATION =
  /^(?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:(?:async\s+)?function\*?\s+(?<function>[A-Za-z_$][\w$]*)|(?:abstract\s+)?class\s+(?!extends\b|implements\b)(?<class>[A-Za-z_$][\w$]*)|interface\s+(?<interface>[A-Za-z_$][\w$]*)|type\s+(?<type>[A-Za-z_$][\w$]*)\s*[=<]|(?:const\s+)?enum\s+(?<enum>[A-Za-z_$][\w$]*)|(?:const|let|var)\s+(?<variable>[A-Za-z_$][\w$]*))/
const PYTHON_DECLARATION = /^(?:(?:async\s+)?def\s+(?<function>[A-Za-z_]\w*)|class\s+(?<class>[A-Za-z_]\w*)|(?<variable>[A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=))/

/**
 * After these characters (or at the start), a `/` begins a regular expression rather than a division.
 * `<` is left out: in JSX, `</div>` is a closing tag.
 */
const BEFORE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '>', '~', '^'])

const hashText = (text: string) => createHash('sha256').update(text.replace(/[ \t]+$/gm, '').trimEnd()).digest('hex')

/**
 * Which lines of a JavaScript or TypeScript file start at the top level (no
 * open bracket, string, template or comment), or null when the brackets never
 * balance and the structure cannot be trusted.
 */
function topLevelLines(source: string): boolean[] | null {
  const lines: boolean[] = [true]
  const stack: string[] = []
  let line = 0
  let previous = ''
  let index = 0
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  /** Skips a block comment. */
  const skipComment = () => {
    while (index < source.length && !source.startsWith('*/', index)) {
      if (source[index] === '\n') lines[++line] = false
      index += 1
    }
    index += 2
  }
  /**
   * Skips a string or regex literal starting after its opening character. Both
   * end on their line, so reaching a newline means it was not one (an
   * apostrophe in JSX text, a division); the caller then treats the opening
   * character as plain text. Returns whether the literal closed.
   */
  const skipLiteral = (close: string, isRegex: boolean): boolean => {
    const from = index
    let inClass = false
    while (index < source.length && source[index] !== '\n') {
      const char = source[index]
      if (char === '\\') {
        index += 2
        continue
      }
      if (isRegex && (char === '[' || char === ']')) inClass = char === '['
      else if (char === close && !inClass) {
        index += 1
        return true
      }
      index += 1
    }
    index = from
    return false
  }
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]
    if (char === '\n') {
      line += 1
      lines[line] = stack.length === 0
      index += 1
      continue
    }
    // Inside template text only `${` and the closing backtick matter: no comments, strings or regexes.
    if (stack.at(-1) === '`') {
      if (char === '\\') index += 2
      else if (char === '$' && next === '{') {
        stack.push('${')
        index += 2
      } else {
        if (char === '`') {
          stack.pop()
          previous = 'a'
        }
        index += 1
      }
      continue
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      skipComment()
      continue
    }
    if ((char === '"' || char === "'") || (char === '/' && BEFORE_REGEX.has(previous))) {
      index += 1
      if (skipLiteral(char, char === '/')) {
        previous = 'a'
        continue
      }
      // Not a literal after all: carry on with the next character as ordinary text.
      previous = 'a'
      continue
    }
    if (char === '`') {
      // Template literal: its ${…} parts are code, so they open a bracket like any other.
      stack.push('`')
      index += 1
      previous = '`'
      continue
    }
    if (char === '(' || char === '[' || char === '{') stack.push(char)
    else if (char in closers) {
      const open = stack.pop()
      if (open !== closers[char] && !(char === '}' && open === '${')) return null
    }
    if (!/\s/.test(char)) previous = /[\w$)\]]/.test(char) ? 'a' : char
    index += 1
  }
  return stack.length === 0 ? lines : null
}

function pythonTopLevelLines(source: string): boolean[] | null {
  // Triple-quoted strings can hold unindented text; skip files whose quotes do not pair up.
  if ((source.match(/"""|'''/g)?.length ?? 0) % 2 !== 0) return null
  let inString: string | null = null
  return source.split('\n').map((text) => {
    const startsInside = inString !== null
    for (const match of text.matchAll(/"""|'''/g)) inString = inString === null ? match[0] : inString === match[0] ? null : inString
    return !startsInside && text.length > 0 && !/^\s/.test(text)
  })
}

interface Declaration {
  name: string
  kind: SymbolKind
  /** Where the declaration's own line is, and where it starts with its decorators and doc comment (0-based). */
  line: number
  start: number
}

/** `export default …` without a name (an anonymous function or class, an object) is the symbol `default`. */
const ANONYMOUS_DEFAULT = /^export\s+default\b/

/**
 * Top-level declarations, each starting at its decorators or doc comment. A
 * top-level `@decorator(…)` opens the next declaration however many lines its
 * arguments take, so a decorator's text is never credited to the symbol before it.
 */
function declarationsAt(lines: readonly string[], topLevel: readonly boolean[], pattern: RegExp): Declaration[] {
  const found: Declaration[] = []
  let pendingStart: number | null = null
  lines.forEach((text, index) => {
    if (!topLevel[index]) return
    if (text.startsWith('@')) {
      pendingStart ??= index
      return
    }
    const groups = pattern.exec(text)?.groups
    const kind = groups ? (Object.keys(groups) as SymbolKind[]).find((key) => groups[key] !== undefined) : undefined
    const declared = kind && groups ? { name: groups[kind], kind } : ANONYMOUS_DEFAULT.test(text) ? { name: 'default', kind: 'variable' as const } : null
    if (!declared) {
      if (text.trim() !== '' && !/^\s*(?:\/\/|\/\*|\*|#)/.test(text)) pendingStart = null
      return
    }
    const floor = found.at(-1)?.line ?? -1
    found.push({ ...declared, line: index, start: pendingStart ?? commentStart(lines, index, floor) })
    pendingStart = null
  })
  return found
}

/** A doc comment directly above a declaration belongs to it. */
function commentStart(lines: readonly string[], line: number, floor: number): number {
  let start = line
  while (start - 1 > floor && /^\s*(?:\/\/|\/\*|\*|#)/.test(lines[start - 1])) start -= 1
  return start
}

/**
 * The top-level symbols of a file, or null when its language is not supported
 * or its structure cannot be read with confidence. A name declared more than
 * once (TypeScript overloads, merged interfaces) is one symbol covering every
 * declaration, so editing any of them, the implementation included, changes it.
 */
export function extractSymbols(path: string, source: string): SourceSymbol[] | null {
  const isPython = PYTHON_EXTENSIONS.test(path)
  if (!isPython && !SCRIPT_EXTENSIONS.test(path)) return null
  const topLevel = isPython ? pythonTopLevelLines(source) : topLevelLines(source)
  if (!topLevel) return null
  const lines = source.split('\n')
  const declarations = declarationsAt(lines, topLevel, isPython ? PYTHON_DECLARATION : SCRIPT_DECLARATION)
  const spans = declarations.map((declaration, index) => {
    let end = (declarations[index + 1]?.start ?? lines.length) - 1
    while (end > declaration.line && lines[end].trim() === '') end -= 1
    return { ...declaration, end }
  })
  const symbols: SourceSymbol[] = []
  for (const name of [...new Set(spans.map((span) => span.name))]) {
    const parts = spans.filter((span) => span.name === name)
    const text = parts.map((part) => lines.slice(part.start, part.end + 1).join('\n')).join('\n')
    symbols.push({ name, kind: parts[0].kind, startLine: parts[0].start + 1, endLine: (parts.at(-1)?.end ?? parts[0].end) + 1, hash: hashText(text) })
  }
  return symbols
}

/** `src/auth.ts#login` → { path: 'src/auth.ts', name: 'login' }, or null for a plain path. */
export function parseSymbolRef(ref: string): { path: string; name: string } | null {
  const hash = ref.lastIndexOf('#')
  if (hash <= 0 || hash === ref.length - 1) return null
  return { path: ref.slice(0, hash), name: ref.slice(hash + 1) }
}
