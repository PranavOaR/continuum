export function normalize(value: string): string {
  return value.toLowerCase().trim()
}

/** True when every whitespace-separated term in the query appears in at least one field. */
export function matchesQuery(query: string, ...fields: Array<string | undefined>): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = normalize(fields.filter(Boolean).join(' '))
  return terms.every((term) => haystack.includes(term))
}
