import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '@renderer/store/uiStore.js'
import { NavList } from './NavList.jsx'
import { BrandMark } from '@renderer/components/ui/BrandMark.jsx'
import { UserSummary } from './UserSummary.jsx'

export function MobileDrawer() {
  const drawerOpen = useUIStore((state) => state.drawerOpen)
  const closeDrawer = useUIStore((state) => state.closeDrawer)

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
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-[#333333]"
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <BrandMark size={30} />
            <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-gray-100">PocketVault</span>
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation menu"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-accent-600 dark:text-gray-400 dark:hover:bg-white/10 dark:focus-visible:outline-accent-400"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <NavList onNavigate={closeDrawer} />

        <div className="border-t border-slate-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-gray-700">
          <UserSummary className="px-1" />
        </div>
      </div>
    </div>
  )
}
