import { useState } from 'react'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { cn } from '@renderer/lib/cn.js'
import Debts from './Debts.jsx'
import { RecurringPanel } from '@renderer/components/debts/RecurringPanel.jsx'
import { CalendarPanel, PayoffPanel } from '@renderer/components/debts/BillsPanels.jsx'

const TABS = [
  { id: 'debts', label: 'Debts' },
  { id: 'bills', label: 'Bills' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'payoff', label: 'Payoff' }
]

export default function BillsDebts() {
  const [tab, setTab] = useState('debts')

  return (
    <div className="space-y-6">
      <PageHeader title="Bills & Debts" description="Debt schedules, recurring bills and a payoff plan in one place." />
      <div role="tablist" aria-label="Bills and debts sections" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-dark-surface-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'min-h-10 shrink-0 cursor-pointer rounded-lg px-4 text-sm font-medium transition-colors',
              tab === item.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-dark-surface dark:text-gray-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-dark-muted dark:hover:text-gray-100'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'debts' ? <Debts embedded /> : null}
      {tab === 'bills' ? <RecurringPanel /> : null}
      {tab === 'calendar' ? <CalendarPanel /> : null}
      {tab === 'payoff' ? <PayoffPanel /> : null}
    </div>
  )
}
