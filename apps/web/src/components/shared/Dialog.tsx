import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { Button, IconButton } from './Button'

type Variant = 'modal' | 'drawer'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const MODAL_WIDTH: Record<Size, string> = {
  sm: 'sm:w-[420px]',
  md: 'sm:w-[560px]',
  lg: 'sm:w-[720px]',
  xl: 'sm:w-[min(1040px,calc(100vw-3rem))]',
}

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  variant?: Variant
  size?: Size
  footer?: ReactNode
  children: ReactNode
}

/**
 * Built on the native <dialog> element, which provides focus containment,
 * Escape-to-close, an inert background and focus restoration.
 */
export function Dialog({ open, onClose, title, description, variant = 'modal', size = 'md', footer, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      document.body.style.overflow = 'hidden'
    } else if (!open && dialog.open) {
      dialog.close()
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const isDrawer = variant === 'drawer'

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className={cn('cn-dialog', isDrawer ? 'cn-drawer m-0 ml-auto h-dvh max-h-dvh w-full sm:w-auto' : 'm-0 h-dvh w-full sm:m-auto sm:h-auto sm:w-auto')}
    >
      {open && (
        <div
          className={cn(
            'cn-dialog-panel flex flex-col border-line bg-surface text-fg sm:shadow-[0_24px_64px_-24px_rgb(20_19_24/0.35)]',
            isDrawer
              ? 'h-dvh w-full border-l sm:w-[480px]'
              : cn('h-dvh w-full sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl sm:border', MODAL_WIDTH[size]),
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[18px] font-normal tracking-[-0.02em] text-fg">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="mt-1 text-[13px] text-muted">
                  {description}
                </div>
              )}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
              <X aria-hidden />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel, tone = 'danger', onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-muted">{description}</p>
    </Dialog>
  )
}
