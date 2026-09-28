import { cn } from '@renderer/lib/cn.js'

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children }) {
  return <div className={cn('border-b border-slate-100 p-4 sm:p-5', className)}>{children}</div>
}

export function CardBody({ className, children }) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>
}

export function CardTitle({ className, children }) {
  return <h2 className={cn('text-sm font-semibold text-slate-900', className)}>{children}</h2>
}
