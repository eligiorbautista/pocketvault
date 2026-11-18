import { ChevronLeft, ChevronRight } from 'lucide-react'
import { NavList } from './NavList.jsx'
import { BrandLockup } from '@renderer/components/ui/BrandLockup.jsx'
import { BrandMark } from '@renderer/components/ui/BrandMark.jsx'
import { UserSummary } from './UserSummary.jsx'
import { cn } from '@renderer/lib/cn.js'

export function Sidebar({ collapsed = false, onToggle }) {
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 dark:border-dark-border dark:bg-dark-surface lg:flex',
        collapsed ? 'w-[76px]' : 'w-64'
      )}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div
        className={cn(
          'flex h-16 items-center border-b border-slate-100 dark:border-dark-border',
          collapsed ? 'justify-center gap-1 px-1.5' : 'justify-between px-4'
        )}
      >
        {collapsed ? <BrandMark size={24} /> : <BrandLockup size={34} />}
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          title={label}
          className={cn(
            'flex shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:text-dark-faint dark:hover:bg-dark-surface-2 dark:hover:text-gray-100 dark:focus-visible:outline-accent-400',
            collapsed ? 'h-9 w-9' : 'h-11 w-11'
          )}
        >
          {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
        </button>
      </div>

      <NavList collapsed={collapsed} />

      <div
        className={cn(
          'border-t border-slate-100 dark:border-dark-border',
          collapsed ? 'p-2' : 'p-3'
        )}
      >
        <UserSummary collapsed={collapsed} />
      </div>
    </aside>
  )
}
