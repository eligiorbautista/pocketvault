import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab = TABS.some((item) => item.id === requestedTab) ? requestedTab : 'debts'
  const [tab, setTab] = useState(initialTab)
  const openNew = searchParams.get('new') === '1'
  const activeTab =
    requestedTab && TABS.some((item) => item.id === requestedTab) ? requestedTab : tab

  useEffect(() => {
    if (requestedTab && TABS.some((item) => item.id === requestedTab) && requestedTab !== tab) {
      setTab(requestedTab)
    }
  }, [requestedTab, tab])

  const selectTab = (id) => {
    setTab(id)
    const next = new URLSearchParams(searchParams)
    if (id === 'debts') next.delete('tab')
    else next.set('tab', id)
    setSearchParams(next, { replace: true })
  }

  const clearNew = () => {
    if (!searchParams.has('new')) return
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bills & Debts" description="Debt schedules, recurring bills and a payoff plan in one place." />
      <div role="tablist" aria-label="Bills and debts sections" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-dark-surface-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeTab === item.id}
            onClick={() => selectTab(item.id)}
            className={cn(
              'min-h-10 shrink-0 cursor-pointer rounded-lg px-4 text-sm font-medium transition-colors',
              activeTab === item.id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-dark-surface dark:text-gray-100'
                : 'text-slate-600 hover:text-slate-900 dark:text-dark-muted dark:hover:text-gray-100'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {activeTab === 'debts' ? <Debts embedded /> : null}
      {activeTab === 'bills' ? <RecurringPanel openNew={openNew} onNewOpened={clearNew} /> : null}
      {activeTab === 'calendar' ? <CalendarPanel /> : null}
      {activeTab === 'payoff' ? <PayoffPanel /> : null}
    </div>
  )
}
