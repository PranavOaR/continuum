import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastTone } from './toasts'

interface Toast {
  id: number
  tone: ToastTone
  message: string
}

const TOAST_DURATION_MS = 4500

const TONE_ICON = { success: CircleCheck, info: Info, error: CircleAlert }
const TONE_CLASS = { success: 'text-success', info: 'text-accent', error: 'text-danger' }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])

  const notify = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-2), { id, tone, message }])
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => notify, [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:bottom-6">
        {toasts.map((toast) => {
          const Icon = TONE_ICON[toast.tone]
          return (
            <div
              key={toast.id}
              className="cn-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_12px_32px_-12px_rgb(20_19_24/0.25)]"
            >
              <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${TONE_CLASS[toast.tone]}`} />
              <p className="flex-1 text-[13px] text-fg">{toast.message}</p>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification" className="text-subtle hover:text-fg">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
