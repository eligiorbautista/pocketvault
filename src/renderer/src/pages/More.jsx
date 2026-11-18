import { Link } from 'react-router-dom'
import {
  Archive,
  BarChart3,
  ChevronRight,
  FileUp,
  HandCoins,
  PiggyBank,
  Settings,
  Target,
  TrendingDown,
  TrendingUp
} from 'lucide-react'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card } from '@renderer/components/ui/Card.jsx'
import { UserSummary } from '@renderer/components/layout/UserSummary.jsx'

const GROUPS = [
  {
    title: 'Money',
    items: [
      { to: '/income', label: 'Income', icon: TrendingUp },
      { to: '/expenses', label: 'Expenses', icon: TrendingDown },
      { to: '/debts', label: 'Bills & Debts', icon: HandCoins },
      { to: '/budgets', label: 'Budgets', icon: PiggyBank },
      { to: '/savings', label: 'Savings & Buckets', icon: Target }
    ]
  },
  {
    title: 'Data',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/import', label: 'Import CSV', icon: FileUp },
      { to: '/archive', label: 'Archive', icon: Archive }
    ]
  },
  {
    title: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }]
  }
]

export default function More() {
  return (
    <div className="space-y-6">
      <PageHeader title="More" description="Everything else, grouped by what it does." />

      <Card>
        <div className="p-3">
          <UserSummary className="px-1" />
        </div>
      </Card>

      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-2" aria-labelledby={`more-${group.title}`}>
          <h2
            id={`more-${group.title}`}
            className="px-1 text-xs font-medium text-slate-500 dark:text-dark-faint"
          >
            {group.title}
          </h2>
          <Card>
            <div className="divide-y divide-slate-100 dark:divide-dark-rule">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-600 dark:text-gray-200 dark:hover:bg-dark-surface-2 dark:focus-visible:outline-accent-400"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-dark-surface-2 dark:text-dark-muted">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight size={16} className="text-slate-400 dark:text-dark-faint" aria-hidden="true" />
                  </Link>
                )
              })}
            </div>
          </Card>
        </section>
      ))}
    </div>
  )
}
