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
        <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.03em] text-slate-900 dark:text-gray-100 sm:text-[2.1rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-[15px] leading-6 text-slate-600 dark:text-dark-muted">{description}</p>
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
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-dark-faint">
            {label}
          </p>
          <p
            className={cn(
              'mt-1.5 whitespace-nowrap text-[clamp(1.25rem,5vw,1.5rem)] font-semibold leading-tight tracking-tight tabular-nums',
              tones[tone]
            )}
          >
            {loading ? '\u2014' : value}
          </p>
          {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-dark-faint">{hint}</p> : null}
        </div>
        {Icon ? (
          <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400 dark:text-dark-faint" />
        ) : null}
      </div>
    </Card>
  )
}
