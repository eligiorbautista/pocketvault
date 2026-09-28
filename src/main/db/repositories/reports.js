import { fromCents, toCents } from '../../../shared/money.js'

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

export function monthlyTotals(db, userId, year) {
  const from = `${year}-01-01`
  const to = `${year}-12-31`

  const incomeRows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS ym, amount FROM income
       WHERE user_id = ? AND date >= ? AND date <= ?`
    )
    .all(userId, from, to)
  const expenseRows = db
    .prepare(
      `SELECT substr(date, 1, 7) AS ym, amount FROM expenses
       WHERE user_id = ? AND date >= ? AND date <= ?`
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

  return MONTH_LABELS.map((label, index) => {
    const ym = `${year}-${String(index + 1).padStart(2, '0')}`
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
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE user_id = ? AND date >= ? AND date <= ?')
    .get(userId, from, to).total
  const expenses = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?')
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
       FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?
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
       FROM income WHERE user_id = ? AND date >= ? AND date <= ?
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
         SUM(CASE WHEN remaining_amount > 0 AND due_date IS NOT NULL AND due_date < date('now') THEN 1 ELSE 0 END) AS overdue_count
       FROM debts WHERE user_id = ?`
    )
    .get(userId)
  return {
    totalDebts: row.total_debts,
    outstanding: fromCents(toCents(row.outstanding)),
    paid: fromCents(toCents(row.paid)),
    overdueCount: row.overdue_count ?? 0
  }
}
