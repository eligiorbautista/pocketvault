import { cn } from '@renderer/lib/cn.js'

export function Field({ label, htmlFor, error, hint, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-900 dark:text-gray-100">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red-500 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500 dark:text-gray-400">{hint}</p>
      ) : null}
    </div>
  )
}

// Left/right split row used in Settings-style cards.
export function SettingRow({ title, description, htmlFor, children, className, last = false }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        !last && 'border-b border-slate-100 dark:border-gray-800',
        className
      )}
    >
      <div className="min-w-0">
        {title ? (
          htmlFor ? (
            <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-900 dark:text-gray-100">
              {title}
            </label>
          ) : (
            <p className="text-sm font-medium text-slate-900 dark:text-gray-100">{title}</p>
          )
        ) : null}
        {description ? (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      {children ? <div className="shrink-0 sm:text-right">{children}</div> : null}
    </div>
  )
}
