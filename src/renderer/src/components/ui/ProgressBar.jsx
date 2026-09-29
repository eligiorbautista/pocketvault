import { cn } from '@renderer/lib/cn.js'
import { formatPercent } from '@renderer/lib/format.js'

export function ProgressBar({ percent = 0, over = false, className }) {
  const width = Math.min(100, Math.max(0, Number(percent) || 0))
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all',
          over ? 'bg-red-500' : width >= 80 ? 'bg-amber-500' : 'bg-accent-500'
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export function ProgressStat({ label, caption, percent, over }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium text-slate-700 dark:text-gray-200">{label}</span>
        <span
          className={cn(
            'text-xs',
            over ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-gray-400'
          )}
        >
          {formatPercent(percent)}
        </span>
      </div>
      <ProgressBar percent={percent} over={over} />
      {caption ? <p className="text-xs text-slate-500 dark:text-gray-400">{caption}</p> : null}
    </div>
  )
}
