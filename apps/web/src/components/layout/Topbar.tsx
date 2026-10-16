import { Bell, FlaskConical, HardDrive, Menu, Search, Settings, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAttentionItems } from '../../hooks/useOverview'
import { useIsLive } from '../../state/dataMode'
import { useUI } from '../../state/ui'
import { AttentionList } from '../shared/AttentionList'
import { IconButton } from '../shared/Button'
import { Popover, PopoverItem } from '../shared/Popover'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const isLive = useIsLive()
  const { openSearch } = useUI()
  const { items } = useAttentionItems()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-8 lg:px-12">
      <IconButton label="Open navigation" onClick={onOpenNav} className="lg:hidden">
        <Menu aria-hidden />
      </IconButton>

      <button
        type="button"
        onClick={openSearch}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-subtle hover:border-line-strong sm:max-w-sm"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="truncate">Search projects, tasks, files…</span>
        <kbd className="ml-auto hidden rounded-sm border border-line bg-surface-2 px-1.5 font-mono text-[10px] text-muted sm:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <span
          title={isLive ? 'Live data from repositories on this machine' : 'Everything in this workspace is mock data'}
          className="mr-2 hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-muted sm:inline-flex"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-live" />
          {isLive ? 'Local workspace' : 'Demo workspace'}
          <span className="flex items-center gap-1 border-l border-line pl-2 label-mono text-fg">
            {isLive ? <HardDrive className="size-3" aria-hidden /> : <FlaskConical className="size-3" aria-hidden />}
            {isLive ? 'Live' : 'Mock data'}
          </span>
        </span>

        <Popover
          className="w-80"
          trigger={(props) => (
            <IconButton label={`Notifications, ${items.length} items need attention`} className="relative" {...props}>
              <Bell aria-hidden />
              {items.length > 0 && (
                <span aria-hidden className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full bg-accent-strong font-mono text-[9px] font-medium text-accent-fg">
                  {items.length}
                </span>
              )}
            </IconButton>
          )}
        >
          {(close) => (
            <div className="p-2">
              <p className="px-1 pb-2 label-mono text-muted">Needs attention</p>
              {items.length === 0 ? (
                <p className="px-1 py-3 text-[13px] text-muted">Nothing needs attention right now.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <AttentionList items={items} onNavigate={close} />
                </div>
              )}
            </div>
          )}
        </Popover>

        <Popover
          className="w-64"
          trigger={(props) => (
            <IconButton label="Account menu" {...props}>
              <span className="flex size-6 items-center justify-center rounded-full border border-line bg-surface-2 text-fg">
                <User className="size-3.5" aria-hidden />
              </span>
            </IconButton>
          )}
        >
          {(close) => (
            <div>
              <div className="border-b border-line px-2.5 py-2">
                <p className="text-[13px] font-medium text-fg">Demo user</p>
                <p className="text-[12px] text-muted">No account. Preferences are stored in this browser only.</p>
              </div>
              <div className="pt-1">
                <PopoverItem
                  icon={<Settings />}
                  onClick={() => {
                    close()
                    navigate('/app/settings')
                  }}
                >
                  Settings
                </PopoverItem>
              </div>
            </div>
          )}
        </Popover>
      </div>
    </header>
  )
}
