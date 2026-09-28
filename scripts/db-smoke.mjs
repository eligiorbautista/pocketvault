// Ad-hoc verification harness for the database/repository layer.
// Bundled with esbuild and executed with Node against a temporary SQLite file,
// exercising the exact production repository code (no mocks).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createDatabase, closeDatabase } from '../src/main/db/connection.js'
import * as users from '../src/main/db/repositories/users.js'
import * as incomeRepo from '../src/main/db/repositories/income.js'
import * as expensesRepo from '../src/main/db/repositories/expenses.js'
import * as debtsRepo from '../src/main/db/repositories/debts.js'
import * as budgetsRepo from '../src/main/db/repositories/budgets.js'
import * as savingsRepo from '../src/main/db/repositories/savings.js'
import * as reportsRepo from '../src/main/db/repositories/reports.js'
import * as dashboardRepo from '../src/main/db/repositories/dashboard.js'

let passed = 0
function check(label, condition, detail) {
  if (!condition) {
    console.error(`FAIL: ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
    process.exitCode = 1
  } else {
    passed += 1
    console.log(`ok: ${label}`)
  }
}

const dir = mkdtempSync(join(tmpdir(), 'pocketvault-smoke-'))
const dbPath = join(dir, 'pocketvault.db')
const db = createDatabase(dbPath)

const alice = users.createUser(db, { username: 'alice', passwordHash: 'x' })
const bob = users.createUser(db, { username: 'bob', passwordHash: 'y' })
check('two users created', alice.id === 1 && bob.id === 2)

incomeRepo.create(db, alice.id, {
  amount: 25000,
  date: '2026-03-01',
  source: 'Salary',
  notes: 'March salary',
  receipt_path: null
})
incomeRepo.create(db, alice.id, {
  amount: 5000.5,
  date: '2026-03-15',
  source: 'Freelance',
  notes: null,
  receipt_path: null
})
incomeRepo.create(db, alice.id, {
  amount: 1000,
  date: '2026-04-02',
  source: 'Gifts',
  notes: null,
  receipt_path: null
})
const aliceIncome = incomeRepo.list(db, alice.id, { page: 1 })
check('alice sees 3 income rows', aliceIncome.total === 3, aliceIncome.total)
check('income pagination meta', aliceIncome.totalPages === 1 && aliceIncome.page === 1)

incomeRepo.create(db, bob.id, {
  amount: 9999,
  date: '2026-03-10',
  source: 'Business',
  notes: null,
  receipt_path: null
})
check('isolation: bob only sees his income', incomeRepo.list(db, bob.id, {}).total === 1)
check('isolation: alice still sees 3', incomeRepo.list(db, alice.id, {}).total === 3)
check(
  'isolation: alice cannot fetch bob row',
  incomeRepo.getById(db, alice.id, incomeRepo.list(db, bob.id, {}).rows[0].id) === null
)

const search = incomeRepo.list(db, alice.id, { search: 'freelance' })
check('income search filter', search.total === 1 && search.rows[0].source === 'Freelance')

expensesRepo.create(db, alice.id, { category: 'food', amount: 1500, date: '2026-03-05', notes: 'groceries' })
expensesRepo.create(db, alice.id, { category: 'food', amount: 500, date: '2026-03-20', notes: null })
expensesRepo.create(db, alice.id, { category: 'transport', amount: 300, date: '2026-03-21', notes: null })
expensesRepo.create(db, alice.id, { category: 'food', amount: 700, date: '2026-04-01', notes: null })

const debt = debtsRepo.create(db, alice.id, {
  creditor: 'Landlord',
  total_amount: 10000,
  due_date: '2026-12-31',
  payment_type: 'fixed-date',
  monthly_amount: null,
  payment_day: null,
  notes: 'rent'
})
check('debt starts unpaid', debt.effective_status === 'unpaid', debt.effective_status)

debtsRepo.addPayment(db, alice.id, debt.id, { amount: 4000, date: '2026-03-05', notes: null })
let updatedDebt = debtsRepo.getById(db, alice.id, debt.id)
check('debt partial after payment', updatedDebt.paid_amount === 4000 && updatedDebt.remaining_amount === 6000)
check('debt effective status partial', updatedDebt.effective_status === 'partial')

debtsRepo.reborrow(db, alice.id, debt.id, { amount: 2000, date: '2026-03-06', notes: 'borrowed more' })
updatedDebt = debtsRepo.getById(db, alice.id, debt.id)
check('reborrow increases total', updatedDebt.total_amount === 12000, updatedDebt.total_amount)
check('reborrow keeps remaining consistent', updatedDebt.remaining_amount === 8000, updatedDebt.remaining_amount)

const payments = debtsRepo.listPayments(db, alice.id, debt.id)
check('debt has 2 ledger entries', payments.length === 2)

debtsRepo.removePayment(db, alice.id, payments.find((p) => p.payment_type === 'reborrow').id)
updatedDebt = debtsRepo.getById(db, alice.id, debt.id)
check('removing reborrow restores total', updatedDebt.total_amount === 10000, updatedDebt.total_amount)

debtsRepo.addPayment(db, alice.id, debt.id, { amount: 6000, date: '2026-03-07', notes: null })
updatedDebt = debtsRepo.getById(db, alice.id, debt.id)
check('debt paid off', updatedDebt.remaining_amount === 0 && updatedDebt.effective_status === 'paid')
check('overpayment is capped by ledger', updatedDebt.paid_amount === 10000, updatedDebt.paid_amount)

debtsRepo.addPayment(db, alice.id, debt.id, { amount: 500, date: '2026-03-08', notes: null })
updatedDebt = debtsRepo.getById(db, alice.id, debt.id)
check('overpayment clamped at zero remaining', updatedDebt.remaining_amount === 0, updatedDebt.remaining_amount)

budgetsRepo.upsert(db, alice.id, { category: 'food', monthly_limit: 1000 })
budgetsRepo.upsert(db, alice.id, { category: 'food', monthly_limit: 2000 })
const budgets = budgetsRepo.listMonthly(db, alice.id, '2026-03')
const foodBudget = budgets.find((b) => b.category === 'food')
check('budget upsert is unique per category', budgets.filter((b) => b.category === 'food').length === 1)
check('budget limit updated', foodBudget.monthly_limit === 2000)
check('budget spent computed for month', foodBudget.spent === 2000, foodBudget.spent)
check('budget over flag', foodBudget.over === false && foodBudget.percent === 100, foodBudget.percent)

const goal = savingsRepo.create(db, alice.id, {
  goal_name: 'Emergency fund',
  target_amount: 50000,
  deadline: '2026-12-31'
})
const incomeForContribution = incomeRepo.list(db, alice.id, {}).rows[0]
savingsRepo.addContribution(db, alice.id, goal.id, {
  amount: 10000,
  date: '2026-03-02',
  income_id: incomeForContribution.id,
  notes: 'from salary'
})
savingsRepo.addContribution(db, alice.id, goal.id, {
  amount: 5000,
  date: '2026-03-03',
  income_id: null,
  notes: null
})
let goalAfter = savingsRepo.getById(db, alice.id, goal.id)
check('savings goal progress', goalAfter.current_amount === 15000 && goalAfter.percent === 30, goalAfter.percent)
check('savings contribution links income', savingsRepo.listContributions(db, alice.id, goal.id)[1].income_source !== undefined)
check('total saved', savingsRepo.totalSaved(db, alice.id) === 15000)

const monthly = reportsRepo.monthlyTotals(db, alice.id, 2026)
const march = monthly[2]
check('monthly totals march income', march.income === 30000.5, march.income)
check('monthly totals march expenses', march.expenses === 2300, march.expenses)
check('monthly net', march.net === 27700.5, march.net)

const range = reportsRepo.rangeTotals(db, alice.id, { from: '2026-03-01', to: '2026-03-31' })
check('range totals', range.income === 30000.5 && range.expenses === 2300 && range.net === 27700.5, range)

const breakdown = reportsRepo.categoryBreakdown(db, alice.id, { from: '2026-03-01', to: '2026-03-31' })
check('category breakdown sums food', breakdown.find((c) => c.category === 'food').total === 2000)
check('category breakdown sorts desc', breakdown[0].category === 'food')

const sources = reportsRepo.incomeBySource(db, alice.id, { from: '2026-03-01', to: '2026-03-31' })
check('income by source', sources.length === 2)

const debtSummary = reportsRepo.debtSummary(db, alice.id)
check('debt summary outstanding zero after payoff', debtSummary.outstanding === 0, debtSummary.outstanding)

const dash = dashboardRepo.getSummary(db, alice.id, '2026-03')
check('dashboard month income', dash.totalIncome === 30000.5, dash.totalIncome)
check('dashboard month expenses', dash.totalExpenses === 2300, dash.totalExpenses)
check('dashboard remaining', dash.remaining === 27700.5, dash.remaining)
check('dashboard total saved', dash.totalSaved === 15000, dash.totalSaved)
check('dashboard budgets over count zero', dash.budgets.over === 0)
check('dashboard recent income capped at 5', dash.recentIncome.length <= 5)

incomeRepo.update(db, alice.id, incomeForContribution.id, {
  amount: 111,
  date: '2026-03-01',
  source: 'Salary',
  notes: 'edited',
  receipt_path: null
})
check('income update persists', incomeRepo.getById(db, alice.id, incomeForContribution.id).amount === 111)
check('income update sets updated_at', Boolean(incomeRepo.getById(db, alice.id, incomeForContribution.id).updated_at))

check('expense delete', expensesRepo.remove(db, alice.id, expensesRepo.list(db, alice.id, {}).rows[0].id) === true)
check('delete other user row is blocked', expensesRepo.remove(db, alice.id, 9999) === false)

const overdueDebt = debtsRepo.create(db, alice.id, {
  creditor: 'Old bill',
  total_amount: 500,
  due_date: '2020-01-01',
  payment_type: 'no-schedule',
  monthly_amount: null,
  payment_day: null,
  notes: null
})
check('overdue status derived from due date', debtsRepo.getById(db, alice.id, overdueDebt.id).effective_status === 'overdue')
check('overdue appears in status filter', debtsRepo.list(db, alice.id, { status: 'overdue' }).total === 1)
check('debt summary counts overdue', reportsRepo.debtSummary(db, alice.id).overdueCount === 1)

closeDatabase()
rmSync(dir, { recursive: true, force: true })

console.log(`\n${passed} checks passed`)
