import { Menu } from 'lucide-react'
import { useUIStore } from '@renderer/store/uiStore.js'
import { BrandMark } from '@renderer/components/ui/BrandMark.jsx'

export function Topbar() {
  const openDrawer = useUIStore((state) => state.openDrawer)

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 pt-[env(safe-area-inset-top)] dark:border-dark-border dark:bg-dark-surface lg:hidden">
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open navigation menu"
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-accent-600 dark:text-dark-muted dark:hover:bg-dark-surface-2 dark:focus-visible:outline-accent-400"
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <div className="flex items-center gap-2">
        <BrandMark size={32} />
        <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-gray-100">PocketVault</span>
      </div>
    </header>
  )
}
