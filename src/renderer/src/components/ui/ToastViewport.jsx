import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react'
import { useUIStore } from '@renderer/store/uiStore.js'
import { cn } from '@renderer/lib/cn.js'

const VARIANTS = {
  success: { icon: CheckCircle2, className: 'border-accent-200 bg-accent-50 text-accent-800' },
  info: { icon: Info, className: 'border-sky-200 bg-sky-50 text-sky-800' },
  warning: { icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-800' },
  error: { icon: XCircle, className: 'border-red-200 bg-red-50 text-red-800' }
}

export function ToastViewport() {
  const toasts = useUIStore((state) => state.toasts)
  const dismissToast = useUIStore((state) => state.dismissToast)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toastItem) => {
        const variant = VARIANTS[toastItem.variant] ?? VARIANTS.info
        const Icon = variant.icon
        return (
          <div
            key={toastItem.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3 shadow-lg',
              variant.className
            )}
          >
            <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm">{toastItem.message}</p>
            <button
              type="button"
              onClick={() => dismissToast(toastItem.id)}
              aria-label="Dismiss notification"
              className="shrink-0 cursor-pointer rounded p-0.5 hover:bg-black/5"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
