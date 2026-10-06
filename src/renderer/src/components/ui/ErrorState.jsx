import { AlertTriangle } from 'lucide-react'
import { Button } from './Button.jsx'

// Shared inline error block so a failed fetch is never rendered as an "empty"
// state (which would look like a genuinely empty account).
export function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/60 dark:bg-red-950/30">
      <AlertTriangle className="text-red-500 dark:text-red-400" size={22} aria-hidden="true" />
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
