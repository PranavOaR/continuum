export type DataMode = 'local' | 'demo'

/** `continuum serve` injects this tag into the app shell it serves; no other host does. */
export const DATA_MODE_META = 'continuum-data'

/**
 * Local mode when this page was served by `continuum serve`, demo mode on any
 * other host (e.g. the static public demo). Read synchronously, with no request,
 * so the page never flickers between the two. During development,
 * VITE_CONTINUUM_DATA=local (with CONTINUUM_API set) forces local mode.
 */
export function readDataMode(doc: Pick<Document, 'querySelector'> | undefined = globalThis.document, forced: string | undefined = import.meta.env.VITE_CONTINUUM_DATA): DataMode {
  if (forced === 'local') return 'local'
  const meta = doc?.querySelector<HTMLMetaElement>(`meta[name="${DATA_MODE_META}"]`)
  return meta?.content === 'local' ? 'local' : 'demo'
}

let current: DataMode | null = null

/** The page's data mode, read once. */
export function dataMode(): DataMode {
  current ??= readDataMode()
  return current
}
