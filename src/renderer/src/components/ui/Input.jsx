import { forwardRef } from 'react'
import { cn } from '@renderer/lib/cn.js'

const base =
  'w-full rounded-lg border bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-600/40 focus:border-accent-600 disabled:bg-slate-50 disabled:text-slate-400'

export function fieldClasses(hasError) {
  return cn(base, 'h-11 px-3', hasError ? 'border-red-400' : 'border-slate-300')
}

export const Input = forwardRef(function Input({ hasError, className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldClasses(hasError), className)} {...props} />
})

export const Textarea = forwardRef(function Textarea({ hasError, className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(base, 'min-h-11 px-3 py-2', hasError ? 'border-red-400' : 'border-slate-300', className)}
      {...props}
    />
  )
})

export const Select = forwardRef(function Select({ hasError, className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(base, 'h-11 px-3 pr-8', hasError ? 'border-red-400' : 'border-slate-300', className)}
      {...props}
    >
      {children}
    </select>
  )
})
