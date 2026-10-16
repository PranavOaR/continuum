import { describe, expect, it, vi } from 'vitest'
import { connectLiveUpdates, LIVE_EVENTS_PATH } from '../services/liveUpdates'

class FakeEventSource extends EventTarget {
  static last: FakeEventSource | undefined
  closed = false
  readonly url: string
  constructor(url: string) {
    super()
    this.url = url
    FakeEventSource.last = this
  }
  close() {
    this.closed = true
  }
}

const handlers = () => ({ onChange: vi.fn(), onConnected: vi.fn(), onDisconnected: vi.fn() })

describe('connectLiveUpdates', () => {
  it('refetches on each change event and reports the connection state', () => {
    const calls = handlers()
    const close = connectLiveUpdates(calls, FakeEventSource as unknown as typeof EventSource)
    const source = FakeEventSource.last as FakeEventSource
    expect(source.url).toBe(LIVE_EVENTS_PATH)
    source.dispatchEvent(new Event('open'))
    source.dispatchEvent(new Event('change'))
    source.dispatchEvent(new Event('error'))
    expect(calls.onConnected).toHaveBeenCalledOnce()
    expect(calls.onChange).toHaveBeenCalledOnce()
    expect(calls.onDisconnected).toHaveBeenCalledOnce()
    close()
    expect(source.closed).toBe(true)
  })

  it('falls back to timed refreshes where EventSource is unavailable', () => {
    const calls = handlers()
    connectLiveUpdates(calls, undefined)
    expect(calls.onDisconnected).toHaveBeenCalledOnce()
  })
})
