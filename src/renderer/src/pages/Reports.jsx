import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { FileDown, FileSpreadsheet, TrendingDown, TrendingUp, Scale } from 'lucide-react'
import { sumPesos } from '@shared/money.js'
import { PageHeader, StatCard } from '@renderer/components/ui/PageHeader.jsx'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card.jsx'
import { Button } from '@renderer/components/ui/Button.jsx'
import { Field } from '@renderer/components/ui/Field.jsx'
import { Input } from '@renderer/components/ui/Input.jsx'
import { EmptyState } from '@renderer/components/ui/EmptyState.jsx'
import { LoadingBlock } from '@renderer/components/ui/Spinner.jsx'
import { categoryLabel, formatCompactCurrency, formatCurrency, formatMonth } from '@renderer/lib/format.js'
import { exportCsv, exportPdf } from '@renderer/lib/export.js'
import { useApiData } from '@renderer/hooks/useApiData.js'
import { toast } from '@renderer/store/uiStore.js'

const PIE_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#64748b']

export default function Reports() {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [exporting, setExporting] = useState(null)
  const range = { from: `${year}-01-01`, to: `${year}-12-31` }

  const monthlyQuery = useApiData(() => window.api.reports.monthlyTotals(year), [year])
  const categoriesQuery = useApiData(
    () => window.api.reports.categoryBreakdown(range),
    [year]
  )
  const sourcesQuery = useApiData(() => window.api.reports.incomeBySource(range), [year])

  const months = monthlyQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const sources = sourcesQuery.data ?? []

  const totalIncome = sumPesos(months.map((m) => m.income))
  const totalExpenses = sumPesos(months.map((m) => m.expenses))
  const net = sumPesos([totalIncome, -totalExpenses])
  const loading = monthlyQuery.loading

  const activeMonths = months.filter((month) => month.income > 0 || month.expenses > 0)

  const runExport = async (kind) => {
    setExporting(kind)
    try {
      if (kind === 'csv') {
        const result = await exportCsv(
          `pocketvault-report-${year}.csv`,
          months,
          [
            { header: 'Month', value: (row) => formatMonth(row.month, 'MMMM yyyy') },
            { header: 'Income', value: (row) => row.income },
            { header: 'Expenses', value: (row) => row.expenses },
            { header: 'Net', value: (row) => row.net }
          ]
        )
        if (result.saved) toast('CSV exported', 'success')
      } else {
        const result = await exportPdf(`pocketvault-report-${year}.pdf`, {
          title: `PocketVault ${year} Report`,
          subtitle: 'Monthly and yearly summary',
          sections: [
            {
              heading: 'Year totals',
              items: [
                { label: 'Total income', value: totalIncome },
                { label: 'Total expenses', value: totalExpenses },
                { label: 'Net', value: net }
              ]
            },
            {
              heading: 'Monthly breakdown',
              items: months.map((month) => ({
                label: formatMonth(month.month, 'MMMM'),
                value: `In ${formatCurrency(month.income)} / Out ${formatCurrency(month.expenses)}`
              }))
            },
            {
              heading: 'Expenses by category',
              items: categories.length
                ? categories.map((category) => ({
                    label: categoryLabel(category.category),
                    value: category.total
                  }))
                : [{ label: 'No expenses recorded', value: '' }]
            },
            {
              heading: 'Income by source',
              items: sources.length
                ? sources.map((source) => ({ label: source.source, value: source.total }))
                : [{ label: 'No income recorded', value: '' }]
            }
          ]
        })
        if (result.saved) toast('PDF exported', 'success')
      }
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Monthly and yearly summaries you can export."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => runExport('csv')}
              loading={exporting === 'csv'}
            >
              <FileSpreadsheet size={16} aria-hidden="true" />
              Export CSV
            </Button>
            <Button onClick={() => runExport('pdf')} loading={exporting === 'pdf'}>
              <FileDown size={16} aria-hidden="true" />
              Export PDF
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <Field label="Year" htmlFor="report-year" className="max-w-xs">
          <Input
            id="report-year"
            type="number"
            min="1970"
            max="2999"
            value={year}
            onChange={(event) => setYear(event.target.value || String(new Date().getFullYear()))}
          />
        </Field>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={`Income ${year}`}
          value={formatCurrency(totalIncome)}
          tone="positive"
          icon={TrendingUp}
          loading={loading}
        />
        <StatCard
          label={`Expenses ${year}`}
          value={formatCurrency(totalExpenses)}
          tone="negative"
          icon={TrendingDown}
          loading={loading}
        />
        <StatCard
          label="Net"
          value={formatCurrency(net)}
          tone={net >= 0 ? 'positive' : 'negative'}
          icon={Scale}
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Income vs expenses by month</CardTitle>
        </CardHeader>
        <CardBody>
          {loading ? (
            <LoadingBlock />
          ) : activeMonths.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No data for this year" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickFormatter={(value) => formatCompactCurrency(value)}
                    width={64}
                  />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expenses by category</CardTitle>
          </CardHeader>
          <CardBody>
            {categoriesQuery.loading ? (
              <LoadingBlock />
            ) : categories.length === 0 ? (
              <EmptyState icon={TrendingDown} title="No expenses recorded" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="total"
                      nameKey="category"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {categories.map((entry, index) => (
                        <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [formatCurrency(value), categoryLabel(name)]}
                    />
                    <Legend formatter={(value) => categoryLabel(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Income by source</CardTitle>
          </CardHeader>
          <CardBody>
            {sourcesQuery.loading ? (
              <LoadingBlock />
            ) : sources.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No income recorded" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {sources.map((source) => (
                  <li key={source.source} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{source.source}</p>
                      <p className="text-xs text-slate-500">{source.count} record(s)</p>
                    </div>
                    <span className="text-sm font-semibold text-accent-700">
                      {formatCurrency(source.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
