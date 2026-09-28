import { useEffect } from 'react'
import { LogOut, Wallet, X } from 'lucide-react'
import { useUIStore } from '@renderer/store/uiStore.js'
import { useAuthStore } from '@renderer/store/authStore.js'
import { NavList } from './NavList.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'

export function MobileDrawer() {
  const drawerOpen = useUIStore((state) => state.drawerOpen)
  const closeDrawer = useUIStore((state) => state.closeDrawer)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, closeDrawer])

  if (!drawerOpen) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl"
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-white">
              <Wallet size={16} aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">PocketVault</span>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation menu"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-accent-600"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <NavList onNavigate={closeDrawer} />

        <div className="border-t border-slate-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <p className="mb-2 px-2 text-xs text-slate-400">
            Signed in as <span className="font-medium text-slate-600">{user?.username}</span>
          </p>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}
