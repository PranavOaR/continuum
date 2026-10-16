const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Coarse relative time, e.g. `3m ago`; never negative. */
export function formatAgo(from: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - from.getTime())
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  return `${Math.floor(elapsed / DAY)}d ago`
}

export function agoFromIso(iso: string | null, now: Date): string {
  if (!iso) return 'at an unknown time'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'at an unknown time' : formatAgo(date, now)
}
