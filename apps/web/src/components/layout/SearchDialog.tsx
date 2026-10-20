import { Activity, CornerDownLeft, FileCode2, FolderGit2, ListChecks, Search, type LucideIcon } from 'lucide-react'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useServiceQuery } from '../../hooks/useServiceQuery'
import { continuumService, type SearchResultKind } from '../../services'
import { useIsLive } from '../../state/dataMode'
import { useUI } from '../../state/ui'
import { cn } from '../../utils/cn'
import { Dialog } from '../shared/Dialog'
import { EmptyState } from '../shared/States'
import { matchCommands, useCommands } from './commands'

const SEARCH_DEBOUNCE_MS = 150
/** With a query, commands come first but never crowd out the search results. */
const MAX_MATCHED_COMMANDS = 5
const KIND_META: Record<SearchResultKind, { icon: LucideIcon; label: string }> = {
  project: { icon: FolderGit2, label: 'Project' },
  task: { icon: ListChecks, label: 'Task' },
  file: { icon: FileCode2, label: 'File' },
  activity: { icon: Activity, label: 'Activity' },
}

/** One row of the palette: a command or a search result. */
interface Item {
  key: string
  group: string
  label: string
  detail?: string
  icon: LucideIcon
  isMono?: boolean
  trailing?: string
  run: () => void
}

function Kbd({ children }: { children: string }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-surface-2 px-1 font-mono text-[10px] text-muted">{children}</kbd>
}

function Shortcuts() {
  return (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-subtle">
      <span className="flex items-center gap-1.5">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> to move
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>↵</Kbd> to open
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>esc</Kbd> to close
      </span>
    </div>
  )
}

/**
 * The command palette (⌘K): every page, project and common action with no
 * query; matching commands and search results as you type. Keyboard focus
 * stays in the field, which announces the active option to screen readers.
 */
export function SearchDialog() {
  const isLive = useIsLive()
  const { isSearchOpen, closeSearch } = useUI()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS)
  const navigate = useNavigate()
  const commands = useCommands()
  const listId = useId()
  const { data: results, isLoading } = useServiceQuery(debouncedQuery ? `search:${debouncedQuery}` : null, () => continuumService.search(debouncedQuery))

  const close = () => {
    closeSearch()
    setQuery('')
    setActiveIndex(0)
  }

  // Commands filter on every keystroke, so Enter right after typing runs what is shown; only search waits for typing to pause.
  const trimmedQuery = query.trim()
  const items = useMemo<Item[]>(() => {
    const commandItems = (trimmedQuery ? matchCommands(commands, trimmedQuery).slice(0, MAX_MATCHED_COMMANDS) : commands).map((command) => ({
      key: command.id,
      group: command.group,
      label: command.label,
      icon: command.icon,
      run: command.run,
    }))
    const resultItems = debouncedQuery
      ? (results ?? []).map((result) => ({
          key: `${result.kind}-${result.id}`,
          group: 'Results',
          label: result.title,
          detail: result.subtitle,
          icon: KIND_META[result.kind].icon,
          isMono: result.kind === 'file',
          trailing: KIND_META[result.kind].label,
          run: () => navigate(result.to),
        }))
      : []
    return [...commandItems, ...resultItems]
  }, [commands, trimmedQuery, debouncedQuery, results, navigate])

  const active = Math.min(activeIndex, Math.max(items.length - 1, 0))
  const choose = (item: Item) => {
    close()
    item.run()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && query) {
      // The first Escape clears the query; the next closes the palette.
      event.stopPropagation()
      setQuery('')
      setActiveIndex(0)
      return
    }
    if (items.length === 0) return
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step !== 0) {
      event.preventDefault()
      const next = (active + step + items.length) % items.length
      setActiveIndex(next)
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(items[active])
    }
  }

  const isSearching = debouncedQuery !== '' && isLoading && items.length === 0
  return (
    <Dialog
      open={isSearchOpen}
      onClose={close}
      title="Search"
      description={isLive ? 'Pages, actions, projects, changed files and activity in your local repositories.' : 'Pages, actions, projects, tasks, file paths and activity in the demo dataset.'}
      size="lg"
      footer={<Shortcuts />}
    >
      <div className="relative mb-3">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
        <input
          data-autofocus
          type="search"
          role="combobox"
          aria-label="Search query"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items.length > 0 ? `${listId}-${active}` : undefined}
          placeholder="Search, or type a command…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-md border border-line-strong bg-surface-2 pr-3 pl-9 text-[14px] text-fg placeholder:text-subtle focus:border-accent/60 focus:outline-none"
        />
      </div>
      {isSearching && <p className="px-1 py-6 text-center text-[13px] text-muted">Searching…</p>}
      {!isSearching && items.length === 0 && debouncedQuery === trimmedQuery && (
        <EmptyState icon={<Search />} title={`No results for “${trimmedQuery}”`} description="Try a project name, a file path such as src/auth, a task keyword, or a page." />
      )}
      <ul id={listId} role="listbox" aria-label="Commands and results" className="-mx-1 max-h-[min(420px,55dvh)] overflow-y-auto px-1">
        {items.map((item, index) => {
          const startsGroup = index === 0 || items[index - 1].group !== item.group
          const isActive = index === active
          return (
            <li key={item.key} role="presentation">
              {startsGroup && <p className={cn('px-2.5 pb-1 label-mono text-subtle', index > 0 && 'mt-3')}>{item.group}</p>}
              <div
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isActive}
                onClick={() => choose(item)}
                onMouseMove={() => index !== active && setActiveIndex(index)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2', isActive ? 'bg-surface-3' : 'hover:bg-surface-2')}
              >
                <item.icon className={cn('size-4 shrink-0', isActive ? 'text-accent' : 'text-muted')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[13px] text-fg', item.isMono && 'font-mono text-[12px]')}>{item.label}</span>
                  {item.detail && <span className="block truncate text-[12px] text-muted">{item.detail}</span>}
                </span>
                {item.trailing && <span className="shrink-0 text-[11px] text-subtle">{item.trailing}</span>}
                {isActive && <CornerDownLeft className="size-3.5 shrink-0 text-subtle" aria-hidden />}
              </div>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
