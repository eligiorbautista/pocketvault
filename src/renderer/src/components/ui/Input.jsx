import { forwardRef, useState } from 'react'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { cn } from '@renderer/lib/cn.js'

const base =
  'w-full rounded-lg border bg-white text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-500 disabled:bg-slate-50 disabled:text-slate-400 dark:bg-[#2f2f2f] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-accent-400 dark:focus:ring-accent-400/30 dark:disabled:bg-gray-800 dark:disabled:text-gray-500'

function border(hasError) {
  return hasError ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-gray-600'
}

export function fieldClasses(hasError) {
  return cn(base, 'h-11 px-3', border(hasError))
}

// Applied to every control so the error state is conveyed to assistive tech,
// not just via the red border. `aria-describedby` mirrors Field's `${id}-error`.
function a11y(hasError, id, describedBy) {
  if (!hasError) return {}
  return {
    'aria-invalid': true,
    'aria-describedby': describedBy ?? (id ? `${id}-error` : undefined)
  }
}

export const Input = forwardRef(function Input({ hasError, className, id, ...props }, ref) {
  return (
    <input
      ref={ref}
      id={id}
      className={cn(fieldClasses(hasError), className)}
      {...a11y(hasError, id, props['aria-describedby'])}
      {...props}
    />
  )
})

// Password input with a show/hide visibility toggle.
export const PasswordInput = forwardRef(function PasswordInput(
  { hasError, className, id, ...props },
  ref
) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        className={cn(fieldClasses(hasError), 'pr-11', className)}
        {...a11y(hasError, id, props['aria-describedby'])}
        {...props}
        type={visible ? 'text' : 'password'}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-accent-600 dark:text-gray-500 dark:hover:text-gray-300 dark:focus-visible:outline-accent-400"
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  )
})

export const Textarea = forwardRef(function Textarea({ hasError, className, id, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      id={id}
      rows={rows}
      className={cn(base, 'min-h-11 px-3 py-2', border(hasError), className)}
      {...a11y(hasError, id, props['aria-describedby'])}
      {...props}
    />
  )
})

export const Select = forwardRef(function Select({ hasError, className, id, children, ...props }, ref) {
  return (
    <div className={cn('relative', className)}>
      <select
        ref={ref}
        id={id}
        className={cn(base, 'h-11 cursor-pointer appearance-none py-0 pl-3 pr-10', border(hasError))}
        {...a11y(hasError, id, props['aria-describedby'])}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={18}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500"
      />
    </div>
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
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:outline-accent-400',
        checked ? 'bg-accent-600' : 'bg-slate-300 dark:bg-gray-600'
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
