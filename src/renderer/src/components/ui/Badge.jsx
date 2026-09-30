import { cn } from '@renderer/lib/cn.js'

const VARIANTS = {
  neutral: 'bg-slate-100 text-slate-600 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
  success: 'bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-900/30 dark:text-accent-300',
  warning: 'bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300',
  info: 'bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
}

export function Badge({ variant = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium',
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

export function statusVariant(status) {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'info'
  if (status === 'overdue') return 'danger'
  return 'neutral'
}
