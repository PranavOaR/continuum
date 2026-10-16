export type DataMode = 'local' | 'demo'

/** How long to wait for a local daemon before settling on demo data. */
export const DETECT_TIMEOUT_MS = 1_500

type Fetch = typeof fetch

/**
 * Local mode when this page is served by `continuum serve` (its /api/health
 * answers as a Continuum daemon); demo mode everywhere else, e.g. a static host.
 */
export async function detectDataMode(fetchImpl: Fetch = fetch, timeoutMs = DETECT_TIMEOUT_MS): Promise<DataMode> {
  try {
    const response = await fetchImpl('/api/health', { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } })
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('application/json')) return 'demo'
    const body = (await response.json()) as { data?: { mode?: unknown } }
    return body.data?.mode === 'local' ? 'local' : 'demo'
  } catch {
    return 'demo'
  }
}

let detected: Promise<DataMode> | null = null

/** The page's data mode, detected once. */
export function dataMode(): Promise<DataMode> {
  detected ??= detectDataMode()
  return detected
}
