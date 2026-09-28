import { cn } from '@renderer/lib/cn.js'

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children }) {
  return (
    <div className={cn('flex items-center gap-3 border-b border-slate-100 p-5', className)}>
      {children}
    </div>
  )
}

export function CardBody({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

export function CardTitle({ className, children }) {
  return <h2 className={cn('text-lg font-semibold text-slate-900', className)}>{children}</h2>
}

// Small soft-colored circular icon for card/section headers.
export function CardIcon({ icon: Icon, className }) {
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700',
        className
      )}
    >
      <Icon size={18} aria-hidden="true" />
    </span>
  )
}
