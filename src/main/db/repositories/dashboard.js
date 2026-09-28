import { fromCents, toCents } from '../../../shared/money.js'
import { monthRange } from './helpers.js'
import * as incomeRepo from './income.js'
import * as expensesRepo from './expenses.js'
import * as debtsRepo from './debts.js'
import * as budgetsRepo from './budgets.js'
import * as savingsRepo from './savings.js'
import { debtSummary } from './reports.js'

// period: a month string 'YYYY-MM' or { from, to, month? } where month is the
// single month budgets are evaluated against (budgets are inherently monthly).
export function getSummary(db, userId, period) {
  let from, to, budgetMonth
  if (typeof period === 'string') {
    ;({ from, to } = monthRange(period))
    budgetMonth = period
  } else {
    ;({ from, to } = period)
    budgetMonth = period.month ?? to.slice(0, 7)
  }

  const income = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE user_id = ? AND date >= ? AND date <= ?')
    .get(userId, from, to).total
  const expenses = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?')
    .get(userId, from, to).total

  const incomeCents = toCents(income)
  const expenseCents = toCents(expenses)

  const budgets = budgetsRepo.listMonthly(db, userId, budgetMonth)
  const goals = savingsRepo.list(db, userId)
  const debts = debtSummary(db, userId)

  return {
    month: budgetMonth,
    budgetMonth,
    from,
    to,
    totalIncome: fromCents(incomeCents),
    totalExpenses: fromCents(expenseCents),
    remaining: fromCents(incomeCents - expenseCents),
    unpaidDebts: debts.outstanding,
    overdueDebts: debts.overdueCount,
    totalSaved: fromCents(toCents(savingsRepo.totalSaved(db, userId))),
    budgets: {
      count: budgets.length,
      over: budgets.filter((b) => b.over).length,
      items: budgets
    },
    goals: goals.slice(0, 5),
    recentIncome: incomeRepo.list(db, userId, { page: 1, pageSize: 5, from, to }).rows,
    recentExpenses: expensesRepo.list(db, userId, { page: 1, pageSize: 5, from, to }).rows
  }
}
