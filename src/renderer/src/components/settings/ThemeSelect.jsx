import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@renderer/lib/cn.js'
import { useThemeStore } from '@renderer/store/themeStore.js'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
]

// Segmented radio group for the Theme preference (light / dark / system).
export function ThemeSelect({ id }) {
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-gray-800"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(value)}
            className={cn(
              'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:focus-visible:outline-accent-400',
              active
                ? 'bg-white text-slate-900 shadow-sm dark:bg-[#3a3a3a] dark:text-gray-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
