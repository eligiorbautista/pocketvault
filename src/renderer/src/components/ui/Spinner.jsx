import { Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/cn.js'

export function Spinner({ className, size = 20 }) {
  return (
    <Loader2 size={size} className={cn('animate-spin text-slate-400 dark:text-gray-500', className)} aria-hidden="true" />
  )
}

export function LoadingBlock({ label = 'Loading\u2026', className }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-slate-500 dark:text-gray-400', className)}>
      <Spinner />
      <span>{label}</span>
    </div>
  )
}
