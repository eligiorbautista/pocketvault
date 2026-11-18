import { toast as sonnerToast } from 'sonner'

// UI-only state. Navigation is handled by the router and layout components.

// Thin wrapper so existing calls (`toast(message, variant)`) map onto sonner.
export function toast(message, variant, options = {}) {
  const notify =
    variant === 'success'
      ? sonnerToast.success
      : variant === 'error'
        ? sonnerToast.error
        : variant === 'warning'
          ? sonnerToast.warning
          : variant === 'info'
            ? sonnerToast.info
            : sonnerToast
  return notify(message, options)
}
