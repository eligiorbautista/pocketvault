import { NavList } from './NavList.jsx'
import { BrandLockup } from '@renderer/components/ui/BrandLockup.jsx'
import { UserSummary } from './UserSummary.jsx'

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-gray-700 dark:bg-[#333333] lg:flex">
      <div className="flex h-16 items-center border-b border-slate-100 px-5 dark:border-gray-700">
        <BrandLockup size={34} />
      </div>

      <NavList />

      <div className="border-t border-slate-100 p-3 dark:border-gray-700">
        <UserSummary className="px-1" />
      </div>
    </aside>
  )
}
