import { fromCents, toCents } from '../../../shared/money.js'
import { todayISO } from '../../../shared/dates.js'

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

// period: a year (number/string) or { from, to } ISO dates.
// A year always yields 12 buckets; a range yields buckets from the first
// month with data to the last month with data (never a giant empty series).
export function monthlyTotals(db, userId, period) {
  let from, to
  const isYear = period === null || period === undefined || typeof period !== 'object'
  if (isYear) {
    const year = String(period ?? new Date().getFullYear())
    from = `${year}-01-01`
    to = `${year}-12-31`
  } else {
    from = period.from
    to = period.to
  }

  const incomeRows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS ym, amount FROM income
       WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0`
    )
    .all(userId, from, to)
  const expenseRows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS ym, amount FROM expenses
       WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0`
    )
    .all(userId, from, to)

  const incomeByMonth = new Map()
  for (const row of incomeRows) {
    incomeByMonth.set(row.ym, (incomeByMonth.get(row.ym) ?? 0) + toCents(row.amount))
  }
  const expenseByMonth = new Map()
  for (const row of expenseRows) {
    expenseByMonth.set(row.ym, (expenseByMonth.get(row.ym) ?? 0) + toCents(row.amount))
  }

  let monthKeys
  if (isYear) {
    const year = String(period ?? new Date().getFullYear())
    monthKeys = MONTH_LABELS.map((_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
  } else {
    const withData = [...new Set([...incomeByMonth.keys(), ...expenseByMonth.keys()])].sort()
    if (withData.length === 0) return []
    // Fill contiguous months between the first and last months that have data.
    monthKeys = []
    let [y, m] = withData[0].split('-').map(Number)
    const [endY, endM] = withData[withData.length - 1].split('-').map(Number)
    while (y < endY || (y === endY && m <= endM)) {
      monthKeys.push(`${y}-${String(m).padStart(2, '0')}`)
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
  }

  const multiYear = monthKeys.length > 0 && monthKeys[0].slice(0, 4) !== monthKeys[monthKeys.length - 1].slice(0, 4)

  return monthKeys.map((ym) => {
    const [y, m] = ym.split('-').map(Number)
    const label = multiYear ? `${MONTH_LABELS[m - 1]} ${String(y).slice(-2)}` : MONTH_LABELS[m - 1]
    const incomeCents = incomeByMonth.get(ym) ?? 0
    const expenseCents = expenseByMonth.get(ym) ?? 0
    return {
      month: ym,
      label,
      income: fromCents(incomeCents),
      expenses: fromCents(expenseCents),
      net: fromCents(incomeCents - expenseCents)
    }
  })
}

export function rangeTotals(db, userId, { from, to }) {
  const income = db
    .prepare(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0'
    )
    .get(userId, from, to).total
  const expenses = db
    .prepare(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0'
    )
    .get(userId, from, to).total
  const incomeCents = toCents(income)
  const expenseCents = toCents(expenses)
  return {
    income: fromCents(incomeCents),
    expenses: fromCents(expenseCents),
    net: fromCents(incomeCents - expenseCents)
  }
}

export function categoryBreakdown(db, userId, { from, to }) {
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) AS count, SUM(amount) AS total
       FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0
       GROUP BY category ORDER BY total DESC`
    )
    .all(userId, from, to)
  return rows.map((row) => ({
    category: row.category,
    count: row.count,
    total: fromCents(toCents(row.total))
  }))
}

export function incomeBySource(db, userId, { from, to }) {
  const rows = db
    .prepare(
      `SELECT COALESCE(NULLIF(source, ''), 'Unspecified') AS source, COUNT(*) AS count, SUM(amount) AS total
       FROM income WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0
       GROUP BY source ORDER BY total DESC`
    )
    .all(userId, from, to)
  return rows.map((row) => ({
    source: row.source,
    count: row.count,
    total: fromCents(toCents(row.total))
  }))
}

export function debtSummary(db, userId) {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total_debts,
         COALESCE(SUM(remaining_amount), 0) AS outstanding,
         COALESCE(SUM(paid_amount), 0) AS paid,
         SUM(CASE WHEN remaining_amount > 0 AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdue_count
       FROM debts WHERE user_id = ? AND is_archived = 0`
    )
    .get(todayISO(), userId)
  return {
    totalDebts: row.total_debts,
    outstanding: fromCents(toCents(row.outstanding)),
    paid: fromCents(toCents(row.paid)),
    overdueCount: row.overdue_count ?? 0
  }
}
