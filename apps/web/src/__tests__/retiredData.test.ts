import { beforeEach, describe, expect, it } from 'vitest'
import { NAV_ITEMS } from '../components/layout/navItems'
import { forgetRetiredData } from '../services/storage'
import { preferencesStore } from '../state/preferences'

const KEY = (name: string) => `continuum.demo.v1.${name}`

beforeEach(() => window.localStorage.clear())

describe('browser data from before Briefings', () => {
  it('keeps your preferences when they still carry the old handoff defaults', () => {
    const stored = { theme: 'dark', defaultProjectId: 'acme', relativeTimestamps: false, reduceMotion: true, preferredSourceAgent: 'codex', preferredTargetAgent: 'cursor', defaultContext: ['decisions'] }
    window.localStorage.setItem(KEY('preferences'), JSON.stringify(stored))

    expect(preferencesStore.load()).toMatchObject({ theme: 'dark', defaultProjectId: 'acme', relativeTimestamps: false, reduceMotion: true })
  })

  it('removes the old handoff history and leaves everything else', () => {
    window.localStorage.setItem(KEY('handoffs'), '{}')
    window.localStorage.setItem(KEY('handoffs.local'), '{}')
    window.localStorage.setItem(KEY('preferences'), '{}')

    forgetRetiredData()

    expect(window.localStorage.getItem(KEY('handoffs'))).toBeNull()
    expect(window.localStorage.getItem(KEY('handoffs.local'))).toBeNull()
    expect(window.localStorage.getItem(KEY('preferences'))).toBe('{}')
  })
})

describe('finding Briefings', () => {
  it('still answers to the word people knew it by', () => {
    expect(NAV_ITEMS.find((item) => item.label === 'Briefings')?.keywords).toContain('handoff')
  })
})
