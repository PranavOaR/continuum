/**
 * Best-effort masking of credentials before anything is stored. It errs toward
 * redacting; it cannot catch every secret, so the store is also owner-only.
 */
export const REDACTED = '[redacted]'

const SECRET_NAME = String.raw`[A-Za-z0-9_.-]*(?:token|secret|passw(?:or)?d|pwd|api[_-]?key|access[_-]?key|credential|private[_-]?key)[A-Za-z0-9_.-]*`

const RULES: readonly (readonly [RegExp, string])[] = [
  // PEM private keys, whole block
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g, REDACTED],
  // Credentials embedded in URLs: scheme://user:pass@host
  [/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, `$1${REDACTED}@`],
  // HTTP auth schemes
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]+/g, `$1 ${REDACTED}`],
  // Well-known token shapes
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|npm_[A-Za-z0-9]{36})\b/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED],
  // --token value, --api-key=value
  [new RegExp(String.raw`(--?${SECRET_NAME})(=|\s+)(?!\[redacted\])([^\s"']+)`, 'gi'), `$1$2${REDACTED}`],
  // NAME=value, name: value, NAME="value"
  [new RegExp(String.raw`\b(${SECRET_NAME})(\s*[=:]\s*)(["']?)(?!\[redacted\])[^\s"']+\3`, 'gi'), `$1$2$3${REDACTED}$3`],
]

export function redactSecrets(text: string): string {
  return RULES.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text)
}
