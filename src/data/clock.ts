/**
 * All mock timestamps are expressed as offsets from the moment the demo loads,
 * so relative times ("26 min ago") stay coherent no matter when it is opened.
 */
const DEMO_ANCHOR_MS = Date.now()
const MINUTE_MS = 60_000

export function minutesAgo(minutes: number): string {
  return new Date(DEMO_ANCHOR_MS - minutes * MINUTE_MS).toISOString()
}

export const HOUR = 60
export const DAY = 24 * HOUR
