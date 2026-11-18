import { NavLink } from 'react-router-dom'
import { NAV_GROUPS } from './navItems.js'
import { cn } from '@renderer/lib/cn.js'

function NavItem({ item, onNavigate, collapsed }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center rounded-lg text-sm font-medium transition-colors',
          collapsed ? 'justify-center px-0' : 'gap-3 px-3',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:focus-visible:outline-accent-400',
          isActive
            ? 'bg-accent-50 text-accent-700 dark:bg-white/10 dark:text-white'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-dark-muted dark:hover:bg-dark-surface-2 dark:hover:text-gray-100'
        )
      }
    >
      <Icon size={18} aria-hidden="true" />
      <span className={collapsed ? 'sr-only' : undefined}>{item.label}</span>
    </NavLink>
  )
}

export function NavList({ onNavigate, collapsed = false }) {
  return (
    <nav
      className={cn('flex flex-1 flex-col overflow-y-auto', collapsed ? 'p-2' : 'p-3')}
      aria-label="Main navigation"
    >
      {NAV_GROUPS.map((group) => (
        <div
          key={group.label}
          role="group"
          aria-label={group.label}
          className={cn(
            'space-y-1',
            group.bottom
              ? 'mt-auto border-t border-slate-100 pt-4 dark:border-dark-rule'
              : collapsed
                ? 'mt-2 border-t border-slate-100 pt-2 first:mt-0 first:border-0 first:pt-0 dark:border-dark-rule'
                : 'mt-4 first:mt-0'
          )}
        >
          {collapsed ? null : (
            <div className="px-3 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-dark-muted">
              {group.label}
            </div>
          )}
          {group.items.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onNavigate} collapsed={collapsed} />
          ))}
        </div>
      ))}
    </nav>
  )
}
