import { Activity, FileCode2, FolderGit2, ListChecks, Search, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useServiceQuery } from '../../hooks/useServiceQuery'
import { continuumService, type SearchResultKind } from '../../services'
import { useUI } from '../../state/ui'
import { cn } from '../../utils/cn'
import { Dialog } from '../shared/Dialog'
import { EmptyState } from '../shared/States'
import { useIsLive } from '../../state/dataMode'

const SEARCH_DEBOUNCE_MS = 150
const KIND_META: Record<SearchResultKind, { icon: LucideIcon; label: string }> = {
  project: { icon: FolderGit2, label: 'Project' },
  task: { icon: ListChecks, label: 'Task' },
  file: { icon: FileCode2, label: 'File' },
  activity: { icon: Activity, label: 'Activity' },
}
const SUGGESTIONS = ['google', 'src/auth', 'mdx', 'retry', 'tests']

function SearchResults({ query, onSelect }: { query: string; onSelect: (to: string) => void }) {
  const { data, isLoading } = useServiceQuery(`search:${query}`, () => continuumService.search(query))
  const [activeIndex, setActiveIndex] = useState(0)
  const results = useMemo(() => data ?? [], [data])

  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent) => {
      // Only drive the list from the search field so Enter on a focused result isn't handled twice.
      if (results.length === 0 || !(event.target instanceof HTMLInputElement)) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % results.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => (index - 1 + results.length) % results.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        onSelect(results[Math.min(activeIndex, results.length - 1)].to)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [results, activeIndex, onSelect])

  if (isLoading) return <p className="px-1 py-6 text-center text-[13px] text-muted">Searching…</p>
  if (results.length === 0) {
    return <EmptyState icon={<Search />} title={`No results for “${query}”`} description="Try a project name, a file path such as src/auth, or a task keyword." />
  }

  return (
    <ul role="listbox" aria-label="Search results" className="space-y-0.5">
      {results.map((result, index) => {
        const { icon: Icon, label } = KIND_META[result.kind]
        return (
          <li key={`${result.kind}-${result.id}`} role="option" aria-selected={index === activeIndex}>
            <button
              type="button"
              onClick={() => onSelect(result.to)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn('flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left', index === activeIndex ? 'bg-surface-3' : 'hover:bg-surface-2')}
            >
              <Icon className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-[13px] text-fg', result.kind === 'file' && 'font-mono text-[12px]')}>{result.title}</span>
                <span className="block truncate text-[12px] text-muted">{result.subtitle}</span>
              </span>
              <span className="shrink-0 text-[11px] text-subtle">{label}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function SearchDialog() {
  const isLive = useIsLive()
  const { isSearchOpen, closeSearch } = useUI()
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS)
  const navigate = useNavigate()

  const close = () => {
    closeSearch()
    setQuery('')
  }
  const select = (to: string) => {
    close()
    navigate(to)
  }

  return (
    <Dialog open={isSearchOpen} onClose={close} title="Search" description={isLive ? 'Projects, changed files, and activity in your local repositories.' : 'Projects, tasks, file paths, and activity in the demo dataset.'} size="lg">
      <div className="relative mb-4">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <input
          autoFocus
          type="search"
          aria-label="Search query"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Escape' && query) {
              event.stopPropagation()
              setQuery('')
            }
          }}
          className="h-10 w-full rounded-md border border-line-strong bg-surface-2 pr-3 pl-9 text-[14px] text-fg placeholder:text-subtle focus:border-accent/60 focus:outline-none"
        />
      </div>
      {debouncedQuery === '' ? (
        <div>
          <p className="mb-2 text-[12px] text-muted">Try searching for</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuery(suggestion)}
                className="rounded-md border border-line px-2.5 py-1 font-mono text-[12px] text-muted hover:border-line-strong hover:text-fg"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <SearchResults key={debouncedQuery} query={debouncedQuery} onSelect={select} />
      )}
    </Dialog>
  )
}
