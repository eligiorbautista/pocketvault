import { create } from 'zustand'
import { toast as sonnerToast } from 'sonner'

export const useUIStore = create((set) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen }))
}))

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
