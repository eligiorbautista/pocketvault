import { Spinner } from '@renderer/components/ui/Spinner.jsx'
import { BrandMark } from '@renderer/components/ui/BrandMark.jsx'

export function SplashScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-dark-bg">
      <BrandMark size={52} className="rounded-xl" />
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400">
        <Spinner />
        <span>Loading PocketVault&hellip;</span>
      </div>
    </div>
  )
}
