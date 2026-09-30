import { api } from '@renderer/lib/api.js'
import { useCallback, useEffect, useState } from 'react'
import { Archive as ArchiveIcon, RotateCcw } from 'lucide-react'
import { PageHeader } from '@renderer/components/ui/PageHeader.jsx'
import { Card, CardBody } from '@renderer/components/ui/Card.jsx'
import { Badge, statusVariant } from '@renderer/components/ui/Badge.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { cn } from '@renderer/lib/cn.js'
import { categoryLabel, formatCurrency, formatDate } from '@renderer/lib/format.js'
import { syncDebtReminders } from '@renderer/lib/notifications.js'
import { toast } from '@renderer/store/uiStore.js'

// Each section defines how to load/restore and how to render a row.
const SECTIONS = [
  {
    key: 'income',
    label: 'Income',
    load: () => api.income.archived(),
    restore: (id) => api.income.restore(id),
    render: (row) => ({
      title: row.source || 'Income',
      meta: `${formatDate(row.date)} · ${formatCurrency(row.amount)}`
    })
  },
  {
    key: 'expenses',
    label: 'Expenses',
    load: () => api.expenses.archived(),
    restore: (id) => api.expenses.restore(id),
    render: (row) => ({
      title: categoryLabel(row.category),
      meta: `${formatDate(row.date)} · ${formatCurrency(row.amount)}`
    })
  },
  {
    key: 'debts',
    label: 'Debts',
    load: () => api.debts.archived(),
    restore: (id) => api.debts.restore(id),
    render: (row) => ({
      title: row.creditor,
      meta: `${formatCurrency(row.remaining_amount)} remaining`,
      badge: { variant: statusVariant(row.effective_status), label: row.effective_status }
    })
  },
  {
    key: 'budgets',
    label: 'Budgets',
    load: () => api.budgets.archived(),
    restore: (id) => api.budgets.restore(id),
    render: (row) => ({
      title: categoryLabel(row.category),
      meta: `${formatCurrency(row.monthly_limit)} / month`
    })
  },
  {
    key: 'savings',
    label: 'Savings',
    load: () => api.savings.archived(),
    restore: (id) => api.savings.restore(id),
    render: (row) => ({
      title: row.goal_name,
      meta: `${formatCurrency(row.current_amount)} of ${formatCurrency(row.target_amount)}`
    })
  }
]

export default function Archive() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(SECTIONS[0].key)
  const [busyId, setBusyId] = useState(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const results = await Promise.all(SECTIONS.map((section) => section.load()))
      const next = {}
      SECTIONS.forEach((section, index) => {
        next[section.key] = results[index] ?? []
      })
      setData(next)
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const restore = async (section, row) => {
    setBusyId(`${section.key}:${row.id}`)
    try {
      await section.restore(row.id)
      setData((prev) => ({
        ...prev,
        [section.key]: prev[section.key].filter((item) => item.id !== row.id)
      }))
      toast('Restored to active', 'success')
      if (section.key === 'debts') syncDebtReminders()
    } catch {
      // The row may have been reactivated elsewhere (e.g. re-adding a budget
      // un-archives it). Re-sync instead of surfacing a raw error.
      toast('That item was already restored', 'info')
      loadAll()
    } finally {
      setBusyId(null)
    }
  }

  const activeSection = SECTIONS.find((section) => section.key === active) ?? SECTIONS[0]
  const rows = data?.[activeSection.key] ?? []
  const total = data ? SECTIONS.reduce((sum, section) => sum + data[section.key].length, 0) : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Archive"
        description="Restore archived records back into the active app. Nothing here is deleted."
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Archive categories">
        {SECTIONS.map((section) => {
          const count = data?.[section.key]?.length ?? 0
          const selected = section.key === active
          return (
            <button
              key={section.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(section.key)}
              className={cn(
                'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:focus-visible:outline-accent-400',
                selected
                  ? 'bg-accent-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-[#333333] dark:text-gray-300 dark:hover:bg-white/10'
              )}
            >
              {section.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs',
                  selected
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-gray-400'
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <LoadingBlock />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ArchiveIcon}
              title={total === 0 ? 'Nothing archived' : `No archived ${activeSection.label.toLowerCase()}`}
              description={
                total === 0
                  ? 'Records you archive from Income, Expenses, Debts, Budgets or Savings will appear here.'
                  : 'This category has no archived records.'
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-gray-800">
              {rows.map((row) => {
                const { title, meta, badge } = activeSection.render(row)
                const key = `${activeSection.key}:${row.id}`
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-gray-100">
                        {title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{meta}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                      <button
                        type="button"
                        onClick={() => restore(activeSection, row)}
                        disabled={busyId === key}
                        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-[#3a3a3a] dark:text-gray-200 dark:hover:bg-[#454545] dark:focus-visible:outline-accent-400"
                      >
                        <RotateCcw size={16} aria-hidden="true" />
                        {busyId === key ? 'Restoring…' : 'Restore'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
