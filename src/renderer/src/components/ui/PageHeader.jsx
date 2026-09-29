import { cn } from '@renderer/lib/cn.js'
import { Card } from './Card.jsx'

export function PageHeader({ title, description, actions, className }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-gray-100">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'default', loading }) {
  const tones = {
    default: 'text-slate-900 dark:text-gray-100',
    positive: 'text-accent-700 dark:text-accent-400',
    negative: 'text-red-600 dark:text-red-400'
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-gray-400">
            {label}
          </p>
          <p className={cn('mt-2 truncate text-2xl font-semibold', tones[tone])}>
            {loading ? '\u2014' : value}
          </p>
          {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300">
            <Icon size={18} aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </Card>
  )
}
