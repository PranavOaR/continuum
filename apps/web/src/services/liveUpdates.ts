/** Server-Sent Events from `continuum serve`: one `change` event whenever a served repository records something. */
export const LIVE_EVENTS_PATH = '/api/events'

export interface LiveUpdateHandlers {
  onChange: () => void
  /** Connected: pushed changes keep data current. */
  onConnected: () => void
  /** Disconnected (EventSource retries by itself): fall back to refreshing on a timer. */
  onDisconnected: () => void
}

/** Subscribes to the daemon's change stream. Returns a function that closes it. */
export function connectLiveUpdates(handlers: LiveUpdateHandlers, EventSourceImpl: typeof EventSource | undefined = globalThis.EventSource): () => void {
  if (!EventSourceImpl) {
    handlers.onDisconnected()
    return () => {}
  }
  const source = new EventSourceImpl(LIVE_EVENTS_PATH)
  source.addEventListener('open', handlers.onConnected)
  source.addEventListener('error', handlers.onDisconnected)
  source.addEventListener('change', handlers.onChange)
  return () => source.close()
}
