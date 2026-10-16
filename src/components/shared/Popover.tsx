import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../utils/cn'

interface PopoverProps {
  trigger: (props: { 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void }) => ReactNode
  align?: 'left' | 'right'
  className?: string
  children: (close: () => void) => ReactNode
}

/** A lightweight disclosure popover: closes on outside click, Escape, or selection. */
export function Popover({ trigger, align = 'right', className, children }: PopoverProps) {
  const [isOpen, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!isOpen) return
    const handlePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  const close = () => setOpen(false)

  return (
    <div ref={containerRef} className="relative">
      {trigger({ 'aria-expanded': isOpen, 'aria-controls': panelId, onClick: () => setOpen((open) => !open) })}
      {isOpen && (
        <div
          id={panelId}
          className={cn(
            'cn-toast absolute top-full z-40 mt-2 border border-line bg-surface p-1',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}

export function PopoverItem({ icon, children, onClick }: { icon?: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-fg hover:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted"
    >
      {icon}
      {children}
    </button>
  )
}
