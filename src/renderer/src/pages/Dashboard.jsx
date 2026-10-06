import { api } from '@renderer/lib/api.js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  HandCoins,
  PiggyBank,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet
} from 'lucide-react'
import { PageHeader, StatCard } from '@renderer/components/ui/PageHeader.jsx'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card.jsx'
import { Badge } from '@renderer/components/ui/Badge.jsx'
import { ProgressBar } from '@renderer/components/ui/ProgressBar.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { ErrorState } from '@renderer/components/ui/ErrorState.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import {
  PeriodFilter,
  dashboardPeriodPayload
} from '@renderer/components/ui/PeriodFilter.jsx'
import {
  categoryLabel,
  currentMonthInput,
  formatCurrency,
  formatDate,
  formatMonth,
  todayInput
} from '@renderer/lib/format.js'
import { useApiData } from '@renderer/hooks/useApiData.js'

export default function Dashboard() {
  const currentMonth = currentMonthInput()
  const [period, setPeriod] = useState({
    mode: 'month',
    month: currentMonth,
    from: `${currentMonth}-01`,
    to: todayInput()
  })

  const { data, loading, error, reload } = useApiData(
    () => api.reports.dashboard(dashboardPeriodPayload(period, currentMonth)),
    [period.mode, period.month, period.from, period.to]
  )

  const budgets = data?.budgets?.items ?? []
  const goals = data?.goals ?? []
  const recentIncome = data?.recentIncome ?? []
  const recentExpenses = data?.recentExpenses ?? []

  const periodLabel =
    period.mode === 'all'
      ? 'all records'
      : period.mode === 'range'
        ? period.from && period.to
          ? `${formatDate(period.from)} \u2013 ${formatDate(period.to)}`
          : 'a custom range'
        : formatMonth(period.month || currentMonth)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Your finances at a glance for ${periodLabel}.`}
        actions={<PeriodFilter value={period} onChange={setPeriod} idPrefix="dash" />}
      />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total income"
          value={formatCurrency(data?.totalIncome ?? 0)}
          icon={TrendingUp}
          tone="positive"
          loading={loading}
        />
        <StatCard
          label="Total expenses"
          value={formatCurrency(data?.totalExpenses ?? 0)}
          icon={TrendingDown}
          tone="negative"
          loading={loading}
        />
        <StatCard
          label="Remaining balance"
          value={formatCurrency(data?.remaining ?? 0)}
          icon={Scale}
          tone={(data?.remaining ?? 0) >= 0 ? 'positive' : 'negative'}
          loading={loading}
        />
        <StatCard
          label="Unpaid debts"
          value={formatCurrency(data?.unpaidDebts ?? 0)}
          hint={data?.overdueDebts ? `${data.overdueDebts} overdue` : 'No overdue debts'}
          icon={HandCoins}
          loading={loading}
        />
        <StatCard
          label="Total saved"
          value={formatCurrency(data?.totalSaved ?? 0)}
          icon={PiggyBank}
          loading={loading}
        />
        <StatCard
          label="Budgets over limit"
          value={`${data?.budgets?.over ?? 0} of ${data?.budgets?.count ?? 0}`}
          hint={period.mode !== 'month' ? `${formatMonth(data?.budgetMonth ?? currentMonth)} limits` : undefined}
          icon={Wallet}
          tone={(data?.budgets?.over ?? 0) > 0 ? 'negative' : 'default'}
          loading={loading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Budget progress</CardTitle>
            <Link to="/budgets" className="text-xs font-medium text-accent-700 hover:underline dark:text-accent-400">
              Manage
            </Link>
          </CardHeader>
          <CardBody className="space-y-4">
            {period.mode !== 'month' && data?.budgetMonth ? (
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Budgets are monthly — showing {formatMonth(data.budgetMonth)}.
              </p>
            ) : null}
            {loading ? (
              <LoadingBlock />
            ) : budgets.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No budgets set"
                description="Set monthly limits to track category spending."
              />
            ) : (
              budgets.slice(0, 5).map((budget) => (
                <div key={budget.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-700 dark:text-gray-200">
                      {categoryLabel(budget.category)}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-gray-400">
                      {formatCurrency(budget.spent)} / {formatCurrency(budget.monthly_limit)}
                    </span>
                  </div>
                  <ProgressBar percent={budget.percent} over={budget.over} />
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Savings goals</CardTitle>
            <Link to="/savings" className="text-xs font-medium text-accent-700 hover:underline dark:text-accent-400">
              Manage
            </Link>
          </CardHeader>
          <CardBody className="space-y-4">
            {loading ? (
              <LoadingBlock />
            ) : goals.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No savings goals"
                description="Create a goal to start saving toward something."
              />
            ) : (
              goals.map((goal) => (
                <div key={goal.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-700 dark:text-gray-200">{goal.goal_name}</span>
                    <span className="text-xs text-slate-500 dark:text-gray-400">
                      {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                    </span>
                  </div>
                  <ProgressBar percent={goal.percent} />
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent income</CardTitle>
            <Link to="/income" className="text-xs font-medium text-accent-700 hover:underline dark:text-accent-400">
              View all
            </Link>
          </CardHeader>
          <CardBody>
            {loading ? (
              <LoadingBlock />
            ) : recentIncome.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No income yet" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-gray-800">
                {recentIncome.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-gray-200">
                        {item.source || 'Income'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-gray-400">{formatDate(item.date)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent-700 dark:text-accent-400">
                      <ArrowUpRight size={14} aria-hidden="true" />
                      {formatCurrency(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent expenses</CardTitle>
            <Link to="/expenses" className="text-xs font-medium text-accent-700 hover:underline dark:text-accent-400">
              View all
            </Link>
          </CardHeader>
          <CardBody>
            {loading ? (
              <LoadingBlock />
            ) : recentExpenses.length === 0 ? (
              <EmptyState icon={TrendingDown} title="No expenses yet" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-gray-800">
                {recentExpenses.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-gray-200">
                        {categoryLabel(item.category)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-gray-400">{formatDate(item.date)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-gray-100">
                      <ArrowDownRight size={14} aria-hidden="true" />
                      {formatCurrency(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="flex justify-center">
        <Link
          to="/reports"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:border-gray-600 dark:bg-[#3a3a3a] dark:text-gray-200 dark:hover:bg-[#454545] dark:focus-visible:outline-accent-400"
        >
          Open full reports
        </Link>
      </div>
        </>
      )}
    </div>
  )
}
