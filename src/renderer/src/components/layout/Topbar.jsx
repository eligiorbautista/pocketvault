import { BrandMark } from '@renderer/components/ui/BrandMark.jsx'

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-slate-200 bg-white px-4 dark:border-dark-border dark:bg-dark-surface lg:hidden">
      <BrandMark size={32} />
      <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-gray-100">
        PocketVault
      </span>
    </header>
  )
}
