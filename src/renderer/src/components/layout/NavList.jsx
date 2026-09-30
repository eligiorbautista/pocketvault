import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navItems.js'
import { cn } from '@renderer/lib/cn.js'

export function NavList({ onNavigate }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:focus-visible:outline-accent-400',
                isActive
                  ? 'bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-gray-100'
              )
            }
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
