import { LogOut } from 'lucide-react'
import { useAuthStore } from '@renderer/store/authStore.js'
import { cn } from '@renderer/lib/cn.js'

// "gio.pineda" -> "GP", "giopineda" -> "GI", "" -> "?"
function initials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0][0] + (parts[0][1] ?? '')).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Account chip shown at the bottom of the sidebar / mobile drawer.
export function UserSummary({ className }) {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const name = user?.username ?? ''

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-100 text-sm font-semibold text-accent-700 dark:bg-accent-950 dark:text-accent-300"
      >
        {initials(name)}
      </span>

      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold text-slate-800 dark:text-gray-100" title={name}>
          {name}
        </p>
        <p className="text-xs text-slate-400 dark:text-gray-500">Signed in</p>
      </div>

      <button
        type="button"
        onClick={logout}
        title="Sign out"
        aria-label="Sign out"
        className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100 dark:focus-visible:outline-accent-400"
      >
        <LogOut size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
