import { forwardRef } from 'react'
import { cn } from '@renderer/lib/cn.js'

const base =
  'w-full rounded-lg border bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-500 disabled:bg-slate-50 disabled:text-slate-400'

function border(hasError) {
  return hasError ? 'border-red-400' : 'border-slate-300'
}

export function fieldClasses(hasError) {
  return cn(base, 'h-11 px-3', border(hasError))
}

export const Input = forwardRef(function Input({ hasError, className, ...props }, ref) {
  return <input ref={ref} className={cn(fieldClasses(hasError), className)} {...props} />
})

export const Textarea = forwardRef(function Textarea({ hasError, className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(base, 'min-h-11 px-3 py-2', border(hasError), className)}
      {...props}
    />
  )
})

export const Select = forwardRef(function Select({ hasError, className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(base, 'h-11 px-3 pr-8', border(hasError), className)}
      {...props}
    >
      {children}
    </select>
  )
})

// iOS-style toggle switch (replaces plain checkboxes).
export function Switch({ checked = false, onChange, id, disabled = false, 'aria-label': ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent-600' : 'bg-slate-300'
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
