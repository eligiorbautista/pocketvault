import { BrandMark } from './BrandMark.jsx'

// App name + maker tagline, shared by the desktop sidebar and the mobile drawer.
export function BrandLockup({ size = 34 }) {
  return (
    <div className="flex items-center gap-2">
      <BrandMark size={size} />
      <div className="flex min-w-0 flex-col items-start leading-tight">
        <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-gray-100">
          PocketVault
        </span>
        <span className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">
          by <span className="font-semibold text-accent-600 dark:text-accent-400">Eli Dev</span>
        </span>
      </div>
    </div>
  )
}
