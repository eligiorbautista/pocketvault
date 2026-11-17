import { NavLink } from 'react-router-dom'
import { NAV_GROUPS } from './navItems.js'
import { cn } from '@renderer/lib/cn.js'

function NavItem({ item, onNavigate }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:focus-visible:outline-accent-400',
          isActive
            ? 'bg-accent-50 text-accent-700 dark:bg-white/10 dark:text-white'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-dark-muted dark:hover:bg-dark-surface-2 dark:hover:text-gray-100'
        )
      }
    >
      <Icon size={18} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function NavList({ onNavigate }) {
  return (
    <nav
      className="flex flex-1 flex-col overflow-y-auto p-3"
      aria-label="Main navigation"
    >
      {NAV_GROUPS.map((group) => (
        <div
          key={group.label}
          role="group"
          aria-label={group.label}
          className={cn(
            'space-y-1',
            group.bottom && 'mt-auto border-t border-slate-100 pt-4 dark:border-dark-rule'
          )}
        >
          <div className="px-3 pb-1.5 text-[11px] font-medium text-slate-400 dark:text-dark-faint">
            {group.label}
          </div>
          {group.items.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  )
}
