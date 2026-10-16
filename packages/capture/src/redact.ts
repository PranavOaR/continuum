/**
 * Best-effort masking of credentials before anything is stored. It errs toward
 * redacting; it cannot catch every secret, so the store is also owner-only.
 */
export const REDACTED = '[redacted]'

// Bounded runs around the keyword: unbounded ones backtrack catastrophically on inputs like `token.token.token…`.
const SECRET_NAME = String.raw`[A-Za-z0-9_.-]{0,40}(?:token|secret|passw(?:or)?d|pass(?![a-z])|pwd|api[_-]?key|access[_-]?key|account[_-]?key|credential|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]{0,40}`
/** Text is redacted in pieces of at most this many characters (split at line ends), so cost stays linear in its length. */
const MAX_CHUNK_CHARS = 16_384
/** Custom patterns come from a repository's config; longer ones are refused rather than risk a pathological pattern. */
const MAX_CUSTOM_PATTERN_CHARS = 200

/** Shorter values after a secret-looking name are code (TOKEN_BYTES = 24), not credentials. */
const MIN_VALUE_LENGTH = 6
/** Type names and literals that follow `token:` in code rather than a credential. */
const CODE_WORDS = 'string|number|boolean|unknown|undefined|null|true|false|never|any|void|object|bigint|symbol|readonly'

/** 'GITHUB_TOKEN' in quotes is the name of a variable holding a secret, not the secret. */
const ENV_NAME = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/

/** `options.token`, `process.env.API_KEY`: code that refers to a secret, not the secret. */
const PROPERTY_PATH = String.raw`[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?![\w$.-])`

/** Random-looking strings at least this long are treated as secrets. */
const MIN_ENTROPY_LENGTH = 32
/** Bits per character above which a mixed-case alphanumeric string is too random to be a word, path or identifier. */
const MIN_BITS_PER_CHAR = 4.2

/** A rule's pattern, its replacement, and optionally a test that leaves a particular match alone. */
type Rule = readonly [RegExp, string, ((match: string, ...groups: string[]) => boolean)?]

/** The quoted value of a NAME="value" match, checked case-sensitively (the rule itself ignores case). */
const quotesVariableName = (match: string, name: string, separator: string) => ENV_NAME.test(match.slice(name.length + separator.length + 1, -1))

const RULES: readonly Rule[] = [
  // PEM, OpenSSH and PGP private keys, whole block
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, REDACTED],
  // Credentials embedded in URLs: scheme://user:pass@host, up to the last @ (passwords may contain @ and /)
  [/\b([a-z][a-z0-9+.-]{0,20}:\/\/)[^\s/@:]+:\S*@(?![^\s/]*@)/gi, `$1${REDACTED}@`],
  // curl -u user:password, --user=user:password
  [/(\s-u\s+|\s--user[=\s]+)([^\s:'"]+):(?!\[redacted\])[^\s'"]+/g, `$1$2:${REDACTED}`],
  // A raw credential straight after an Authorization header (schemes are handled below)
  [/(Authorization:\s*)(?!Bearer\b|Basic\b|Token\b|\[redacted\])[A-Za-z0-9._~+/=-]{8,}/gi, `$1${REDACTED}`],
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
  [new RegExp(String.raw`\b(${SECRET_NAME}["']?)(\s*(?:=(?!=)|:)\s*)(["'])(?!\[redacted\])[^"'\n]{${MIN_VALUE_LENGTH},}\3`, 'gi'), `$1$2$3${REDACTED}$3`, quotesVariableName],
  // NAME=value and name: value, unquoted. Code is left alone: comparisons (===), type annotations
  // (token: string), short values (TOKEN_BYTES = 24), calls (apiToken = link.get('token')) and
  // property paths (password = process.env.DB_PASSWORD).
  [
    new RegExp(
      String.raw`\b(${SECRET_NAME}["']?)(\s*(?:=(?!=)|:)\s*)(?!\[redacted\])(?!(?:${CODE_WORDS})\b)(?!${PROPERTY_PATH})[^\s"'()\[\]{},;<>]{${MIN_VALUE_LENGTH},}(?![^\s"'()\[\]{},;<>]*\()`,
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
    if (pattern.length > MAX_CUSTOM_PATTERN_CHARS) return []
    try {
      return [new RegExp(pattern, 'g')]
    } catch {
      return []
    }
  })
  return customRules.length
}

/** Splits long text at line ends into pieces of bounded size; a single huge line is cut where it must be. */
function chunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text]
  const pieces: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, text.length)
    const newline = text.lastIndexOf('\n', end)
    if (end < text.length && newline > start) end = newline + 1
    pieces.push(text.slice(start, end))
    start = end
  }
  return pieces
}

/** Redacts and says how many secrets it replaced. Cost grows linearly with the text, however long. */
export function redactWithCount(text: string): { text: string; count: number } {
  const results = chunks(text).map(redactChunk)
  return { text: results.map((result) => result.text).join(''), count: results.reduce((total, result) => total + result.count, 0) }
}

function redactChunk(text: string): { text: string; count: number } {
  let count = 0
  const replaceCounting = (current: string, pattern: RegExp, replacement: string, keep?: Rule[2]) =>
    current.replace(pattern, (...match) => {
      if (keep?.(...(match.filter((part) => typeof part === 'string') as [string, ...string[]]))) return match[0] as string
      count += 1
      // Re-run the single match so $1-style references in the replacement still work.
      return (match[0] as string).replace(new RegExp(pattern.source, pattern.flags.replace('g', '')), replacement)
    })
  let result = RULES.reduce((current, [pattern, replacement, keep]) => replaceCounting(current, pattern, replacement, keep), text)
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
