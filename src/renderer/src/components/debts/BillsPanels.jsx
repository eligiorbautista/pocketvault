import { useState } from 'react'
import { api } from '@renderer/lib/api.js'
import { buildPayoffPlan } from '@shared/payoff.js'
import { forecastCashFlow, upcomingRules } from '@shared/recurring.js'
import { Card, CardBody } from '@renderer/components/ui/Card.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input, Select } from '@renderer/components/ui/Input.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { ErrorState } from '@renderer/components/ui/ErrorState.jsx'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { formatCurrency, formatDate, todayInput } from '@renderer/lib/format.js'
import { cn } from '@renderer/lib/cn.js'
import { CalendarDays, Target } from 'lucide-react'

export function PayoffPanel() {
  const { data, loading, error, reload } = useApiData(
    () => api.debts.list({ page: 1, pageSize: 500 }),
    []
  )
  const [strategy, setStrategy] = useState('snowball')
  const [extra, setExtra] = useState('')
  const rows = data?.rows ?? []
  const plan = buildPayoffPlan(rows, strategy, Number(extra) || 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-gray-100">Payoff plan</h2>
        <p className="text-sm text-slate-600 dark:text-dark-muted">A read-only projection. It never changes a debt or posts a payment.</p>
      </div>
      <Card><CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Strategy" htmlFor="payoff-strategy">
          <Select id="payoff-strategy" value={strategy} onChange={(event) => setStrategy(event.target.value)}>
            <option value="snowball">Snowball — smallest balance first</option>
            <option value="avalanche">Largest balance first</option>
          </Select>
        </Field>
        <Field label="Extra per month" htmlFor="payoff-extra" hint="Applied after each debt's monthly payment">
          <Input id="payoff-extra" type="number" min="0" step="0.01" value={extra} onChange={(event) => setExtra(event.target.value)} />
        </Field>
      </CardBody></Card>
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState icon={Target} title="No payoff to plan" description="Add a debt with a monthly payment to project a payoff date." />
      ) : null}
      {plan.ordered.length ? (
        <Card><CardBody className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-dark-muted">
            {plan.finished ? `Projected ${plan.months} months.` : 'The projection did not finish within 50 years.'}
          </p>
          <ol className="space-y-2">
            {plan.ordered.map((debt) => (
              <li key={debt.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-dark-surface-2">
                <span className="text-sm text-slate-800 dark:text-gray-200">{debt.name}</span>
                <span className="text-sm font-medium text-slate-900 dark:text-gray-100">{formatCurrency(debt.remainingCents / 100)}</span>
              </li>
            ))}
          </ol>
        </CardBody></Card>
      ) : null}
      {plan.unplanned.length ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Set a monthly payment on: {plan.unplanned.map((debt) => debt.name).join(', ')}.
        </p>
      ) : null}
    </div>
  )
}

export function CalendarPanel() {
  const { data, loading, error, reload } = useApiData(() => api.recurring.list(), [])
  const debts = useApiData(() => api.debts.list({ page: 1, pageSize: 500 }), [])
  const wallets = useApiData(() => api.wallets.summary(), [])
  const today = todayInput()
  const horizon = new Date(`${today}T00:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + 60)
  const end = horizon.toISOString().slice(0, 10)
  const forecast = forecastCashFlow({
    startBalance: wallets.data?.netBalance ?? 0,
    rules: data ?? [],
    debts: debts.data?.rows ?? [],
    today,
    days: 60
  })
  const entries = [
    ...upcomingRules(data ?? [], today, 60).map((rule) => ({
      key: `bill-${rule.id}`,
      name: rule.name,
      due: rule.next_due,
      amount: rule.amount,
      kind: rule.kind === 'income' ? 'Income' : 'Bill'
    })),
    ...(debts.data?.rows ?? [])
      .filter((debt) => debt.remaining_amount > 0 && debt.due_date && debt.due_date <= end)
      .map((debt) => ({
        key: `debt-${debt.id}`,
        name: debt.creditor,
        due: debt.due_date,
        amount: debt.remaining_amount,
        kind: 'Debt'
      }))
  ].sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name))
  const busy = loading || debts.loading || wallets.loading
  const failure = error || debts.error || wallets.error

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-gray-100">Upcoming bills & debts</h2>
        <p className="text-sm text-slate-600 dark:text-dark-muted">The next 60 days of recurring rules and debt due dates.</p>
      </div>
      {!busy && !failure ? (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                  Projected balance in 60 days
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-dark-muted">
                  Starting {formatCurrency(forecast.start)} · bills −{formatCurrency(forecast.expenses)} ·
                  debt −{formatCurrency(forecast.debt)} · income +{formatCurrency(forecast.income)}
                </p>
              </div>
              <span className={cn(
                'text-xl font-semibold tracking-tight',
                forecast.end < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-gray-100'
              )}>
                {formatCurrency(forecast.end)}
              </span>
            </div>
            {forecast.end < 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                This projection goes below zero. Review due bills and upcoming income.
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
      {busy ? <LoadingBlock /> : null}
      {failure ? <ErrorState message={failure} onRetry={() => { reload(); debts.reload(); wallets.reload() }} /> : null}
      {!busy && !failure && entries.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing due" description="Recurring bills and debts with a due date will appear here." />
      ) : null}
      {entries.map((entry) => (
        <Card key={entry.key}><CardBody className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900 dark:text-gray-100">{entry.name}</p>
            <p className="text-xs text-slate-600 dark:text-dark-muted">{formatDate(entry.due)} · {entry.kind}</p>
          </div>
          <span className="text-sm font-semibold text-slate-900 dark:text-gray-100">{formatCurrency(entry.amount)}</span>
        </CardBody></Card>
      ))}
    </div>
  )
}
