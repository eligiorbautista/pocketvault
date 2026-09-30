import { NavList } from './NavList.jsx'
import { BrandMark } from '@renderer/components/ui/BrandMark.jsx'
import { UserSummary } from './UserSummary.jsx'

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-gray-700 dark:bg-[#333333] lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5 dark:border-gray-700">
        <BrandMark size={34} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-gray-100">
            PocketVault
          </span>
          <span className="truncate text-[11px] font-medium text-slate-400 dark:text-gray-500">
            by Eli Dev
          </span>
        </div>
      </div>

      <NavList />

      <div className="border-t border-slate-100 p-3 dark:border-gray-700">
        <UserSummary className="px-1" />
      </div>
    </aside>
  )
}
