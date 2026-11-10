import { useEffect, useRef, useState } from 'react'
import type { ActivityEvent, ActivityQuery } from '@continuum/core'
import { continuumService } from '../services'

export type HistoryFilters = Pick<ActivityQuery, 'type' | 'agent' | 'from' | 'to'>

interface History {
  /** The filters these pages answer; a different key means they belong to an earlier question. */
  key: string
  events: ActivityEvent[]
  /** The cursor for the next older page; null once the first recorded event is on screen. */
  nextBefore: number | null
  isLoading: boolean
  error?: Error
}

export interface ActivityHistory {
  events: ActivityEvent[]
  hasOlder: boolean
  isLoading: boolean
  error: Error | undefined
  loadOlder: () => void
}

/**
 * One project's whole recorded history, a page at a time, oldest pages added
 * below. Filters are applied where the history is read, so "Load older" keeps
 * going back until the first event that matches. A null project loads nothing.
 */
export function useActivityHistory(projectId: string | null, filters: HistoryFilters): ActivityHistory {
  const key = JSON.stringify([projectId, filters.type, filters.agent, filters.from, filters.to])
  const [history, setHistory] = useState<History>({ key: '', events: [], nextBefore: null, isLoading: false })
  const current: History = history.key === key ? history : { key, events: [], nextBefore: null, isLoading: projectId !== null }

  // Only the latest request may answer: a page asked for before the filters changed is dropped.
  const latest = useRef(0)

  const load = (before: number | undefined, earlier: ActivityEvent[]) => {
    const request = ++latest.current
    if (projectId === null) return
    setHistory({ key, events: earlier, nextBefore: null, isLoading: true })
    continuumService.listActivityPage(projectId, { ...filters, ...(before === undefined ? {} : { before }) }).then(
      (page) => {
        if (request === latest.current) setHistory({ key, events: [...earlier, ...page.events], nextBefore: page.nextBefore, isLoading: false })
      },
      (error: unknown) => {
        if (request === latest.current) setHistory({ key, events: earlier, nextBefore: null, isLoading: false, error: error instanceof Error ? error : new Error(String(error)) })
      },
    )
  }

  useEffect(() => {
    load(undefined, [])
    // Leaving the page, or changing project, drops whatever is still on its way.
    return () => {
      latest.current += 1
    }
    // The key names everything the first page depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return {
    events: current.events,
    hasOlder: current.nextBefore !== null,
    isLoading: current.isLoading,
    error: current.error,
    loadOlder: () => {
      if (current.nextBefore !== null && !current.isLoading) load(current.nextBefore, current.events)
    },
  }
}
