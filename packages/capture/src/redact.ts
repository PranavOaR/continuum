/**
 * Best-effort masking of credentials before anything is stored. It errs toward
 * redacting; it cannot catch every secret, so the store is also owner-only.
 */
export const REDACTED = '[redacted]'

const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*(?:token|secret|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|account[_-]?key|credential|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*`

/** Shorter values after a secret-looking name are code (TOKEN_BYTES = 24), not credentials. */
const MIN_VALUE_LENGTH = 6
/** Type names and literals that follow `token:` in code rather than a credential. */
const CODE_WORDS = 'string|number|boolean|unknown|undefined|null|true|false|never|any|void|object|bigint|symbol|readonly'

/** Random-looking strings at least this long are treated as secrets. */
const MIN_ENTROPY_LENGTH = 32
/** Bits per character above which a mixed-case alphanumeric string is too random to be a word, path or identifier. */
const MIN_BITS_PER_CHAR = 4.2

const RULES: readonly (readonly [RegExp, string])[] = [
  // PEM, OpenSSH and PGP private keys, whole block
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, REDACTED],
  // Credentials embedded in URLs: scheme://user:pass@host
  [/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, `$1${REDACTED}@`],
  // HTTP auth schemes. Basic and Token need a credential-like value (with a digit), so prose such as "Token budget" stays.
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${REDACTED}`],
  [/\b(Basic|Token)\s+(?=[A-Za-z0-9._~+/=-]*\d)[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${REDACTED}`],
  // Well-known token shapes
  [
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{24,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|npm_[A-Za-z0-9]{36}|SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}|hf_[A-Za-z0-9]{30,})\b/g,
    REDACTED,
  ],
  [/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED],
  // --token value, --api-key=value (a real flag: not the "-password" in "email-and-password")
  [new RegExp(String.raw`(?<![\w-])(--?${SECRET_NAME})(=|\s+)(?!\[redacted\])([^\s"']+)`, 'gi'), `$1$2${REDACTED}`],
  // NAME="value" and name: 'value' in configs and shells
  [new RegExp(String.raw`\b(${SECRET_NAME})(\s*(?:=(?!=)|:)\s*)(["'])(?!\[redacted\])[^"'\n]{${MIN_VALUE_LENGTH},}\3`, 'gi'), `$1$2$3${REDACTED}$3`],
  // NAME=value and name: value, unquoted. Code is left alone: comparisons (===), type annotations
  // (token: string), short values (TOKEN_BYTES = 24) and expressions (apiToken = link.get('token')).
  [
    new RegExp(
      String.raw`\b(${SECRET_NAME})(\s*(?:=(?!=)|:)\s*)(?!\[redacted\])(?!(?:${CODE_WORDS})\b)[^\s"'()\[\]{},;<>]{${MIN_VALUE_LENGTH},}(?![^\s"'()\[\]{},;<>]*\()`,
      'gi',
    ),
    `$1$2${REDACTED}`,
  ],
]

/** Shannon entropy in bits per character. */
function bitsPerChar(text: string): number {
  const counts = new Map<string, number>()
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1)
  let bits = 0
  for (const count of counts.values()) {
    const p = count / text.length
    bits -= p * Math.log2(p)
  }
  return bits
}

/**
 * A generated secret: long, mixing upper case, lower case and digits, and
 * close to random. Hex-only strings (commit and content hashes, UUIDs) and
 * anything with path or word structure fall below the bar.
 */
function looksRandom(candidate: string): boolean {
  if (!/[A-Z]/.test(candidate) || !/[a-z]/.test(candidate) || !/[0-9]/.test(candidate)) return false
  return bitsPerChar(candidate) >= MIN_BITS_PER_CHAR
}

const ENTROPY_CANDIDATE = new RegExp(String.raw`(?<![A-Za-z0-9_+=-])[A-Za-z0-9_+=-]{${MIN_ENTROPY_LENGTH},}(?![A-Za-z0-9_+=-])`, 'g')

let customRules: readonly RegExp[] = []

/**
 * Extra patterns from the repository's config (`redactPatterns`), applied after
 * the built-in rules. Invalid patterns are skipped; returns the ones in use.
 */
export function setCustomRedactions(patterns: readonly string[]): number {
  customRules = patterns.flatMap((pattern) => {
    try {
      return [new RegExp(pattern, 'g')]
    } catch {
      return []
    }
  })
  return customRules.length
}

/** Redacts and says how many secrets it replaced. */
export function redactWithCount(text: string): { text: string; count: number } {
  let count = 0
  const replaceCounting = (current: string, pattern: RegExp, replacement: string) =>
    current.replace(pattern, (...match) => {
      count += 1
      // Re-run the single match so $1-style references in the replacement still work.
      return (match[0] as string).replace(new RegExp(pattern.source, pattern.flags.replace('g', '')), replacement)
    })
  let result = RULES.reduce((current, [pattern, replacement]) => replaceCounting(current, pattern, replacement), text)
  result = result.replace(ENTROPY_CANDIDATE, (candidate) => {
    if (!looksRandom(candidate)) return candidate
    count += 1
    return REDACTED
  })
  result = customRules.reduce((current, pattern) => replaceCounting(current, pattern, REDACTED), result)
  return { text: result, count }
}

export function redactSecrets(text: string): string {
  return redactWithCount(text).text
}
