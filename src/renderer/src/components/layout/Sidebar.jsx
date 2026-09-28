import { LogOut, Wallet } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore.js'
import { NavList } from './NavList.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'

export function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white">
          <Wallet size={18} aria-hidden="true" />
        </span>
        <span className="text-base font-semibold tracking-tight text-slate-900">PocketVault</span>
      </div>

      <NavList />

      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 px-2">
          <p className="text-xs text-slate-400">Signed in as</p>
          <p className="truncate text-sm font-medium text-slate-700">{user?.username}</p>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
