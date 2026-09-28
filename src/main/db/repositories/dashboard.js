import { fromCents, toCents } from '../../../shared/money.js'
import { monthRange } from './helpers.js'
import * as incomeRepo from './income.js'
import * as expensesRepo from './expenses.js'
import * as debtsRepo from './debts.js'
import * as budgetsRepo from './budgets.js'
import * as savingsRepo from './savings.js'
import { debtSummary } from './reports.js'

export function getSummary(db, userId, month) {
  const { from, to } = monthRange(month)

  const income = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE user_id = ? AND date >= ? AND date <= ?')
    .get(userId, from, to).total
  const expenses = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?')
    .get(userId, from, to).total

  const incomeCents = toCents(income)
  const expenseCents = toCents(expenses)

  const budgets = budgetsRepo.listMonthly(db, userId, month)
  const goals = savingsRepo.list(db, userId)
  const debts = debtSummary(db, userId)

  return {
    month,
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
    recentIncome: incomeRepo.list(db, userId, { page: 1, pageSize: 5 }).rows,
    recentExpenses: expensesRepo.list(db, userId, { page: 1, pageSize: 5 }).rows
  }
}
