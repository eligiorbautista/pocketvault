import { Link } from 'react-router-dom'
import { CalendarClock, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card.jsx'

export const QUICK_ACTIONS = [
  { to: '/income?new=1', label: 'Add income', icon: TrendingUp },
  { to: '/expenses?new=1', label: 'Add expense', icon: TrendingDown },
  { to: '/debts?tab=bills&new=1', label: 'Add bill', icon: CalendarClock },
  { to: '/wallet?new=wallet', label: 'Add wallet', icon: WalletCards }
]

export function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition-colors hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-200 dark:hover:border-accent-700 dark:hover:bg-accent-950/50 dark:hover:text-accent-200 dark:focus-visible:outline-accent-400"
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}
