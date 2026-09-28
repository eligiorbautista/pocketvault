import { Menu, Wallet } from 'lucide-react'
import { useUIStore } from '@renderer/store/uiStore.js'

export function Topbar() {
  const openDrawer = useUIStore((state) => state.openDrawer)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open navigation menu"
        className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-accent-600"
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-white">
          <Wallet size={16} aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold tracking-tight text-slate-900">PocketVault</span>
      </div>
    </header>
  )
}
