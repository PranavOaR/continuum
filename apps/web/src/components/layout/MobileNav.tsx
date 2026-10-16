import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { IconButton } from '../shared/Button'
import { SidebarContent } from './Sidebar'

/** Off-canvas navigation for screens narrower than the persistent sidebar breakpoint. */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-label="Navigation"
      className="cn-dialog m-0 h-dvh max-h-dvh w-80"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="cn-dialog-panel relative h-full border-r border-line bg-bg">
          <IconButton label="Close navigation" onClick={onClose} className="absolute top-3 right-3">
            <X aria-hidden />
          </IconButton>
          <SidebarContent onNavigate={onClose} />
        </div>
      )}
    </dialog>
  )
}
