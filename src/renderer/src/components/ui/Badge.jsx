import { cn } from '@renderer/lib/cn.js'

const VARIANTS = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-accent-50 text-accent-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700'
}

export function Badge({ variant = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
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
