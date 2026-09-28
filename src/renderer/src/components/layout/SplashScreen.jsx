import { Wallet } from 'lucide-react'
import { Spinner } from '@renderer/components/ui/Spinner.jsx'

export function SplashScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-600 text-white">
        <Wallet size={24} aria-hidden="true" />
      </span>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner />
        <span>Loading PocketVault&hellip;</span>
      </div>
    </div>
  )
}
