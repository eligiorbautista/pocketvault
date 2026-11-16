// Large-data smoke test. Seeds ~70k rows through the real repositories and
// exercises the query paths the UI uses (lists, summary, activity, reports,
// budgets, savings, archive). Timings are reported; correctness is asserted.
import { rmSync } from 'node:fs'
import { createDatabase, closeDatabase } from '../src/main/db/connection.js'
import * as usersRepo from '../src/main/db/repositories/users.js'
import * as walletsRepo from '../src/main/db/repositories/wallets.js'
import * as incomeRepo from '../src/main/db/repositories/income.js'
import * as expensesRepo from '../src/main/db/repositories/expenses.js'
import * as debtsRepo from '../src/main/db/repositories/debts.js'
import * as budgetsRepo from '../src/main/db/repositories/budgets.js'
import * as savingsRepo from '../src/main/db/repositories/savings.js'
import * as reportsRepo from '../src/main/db/repositories/reports.js'
import * as dashboardRepo from '../src/main/db/repositories/dashboard.js'
import { fromCents, toCents } from '../src/shared/money.js'
import { PAGE_SIZE } from '../src/shared/constants.js'

const DB_PATH = '.pv-stress.db'
for (const suffix of ['', '-wal', '-shm']) rmSync(`${DB_PATH}${suffix}`, { force: true })

const INCOME = 20_000
const EXPENSES = 30_000
const DEBTS = 2_000
const PAYMENTS = 3
const TRANSFERS = 10_000
const ARCHIVED_INCOME = 1_000
const GOALS = 50
const CONTRIBUTIONS = 1_000

let checks = 0
let failures = 0
const timings = []

function check(name, condition) {
  checks += 1
  if (!condition) {
    failures += 1
    console.error(`FAIL  ${name}`)
  }
}

function measure(name, fn) {
  const start = performance.now()
  const result = fn()
  timings.push({ name, ms: performance.now() - start })
  return result
}

const db = createDatabase(DB_PATH)
const user = usersRepo.createUser(db, { username: 'stress', passwordHash: 'x' })
const cash = walletsRepo.list(db, user.id)[0]
const bdo = walletsRepo.create(db, user.id, {
  name: 'BDO',
  type: 'bank',
  style: 'bdo',
  opening_balance: 0,
  last4: '1234'
})
const gcash = walletsRepo.create(db, user.id, {
  name: 'GCash',
  type: 'ewallet',
  style: 'gcash',
  opening_balance: 0
})

const expected = new Map([
  [cash.id, 0],
  [bdo.id, 0],
  [gcash.id, 0]
])
const add = (walletId, cents) => expected.set(walletId, expected.get(walletId) + cents)
const cycle = [cash.id, bdo.id, gcash.id]
const incomeCents = toCents(100)
const expenseCents = toCents(25)
const paymentCents = toCents(100)
const transferCents = toCents(10)

const insertIncome = db.prepare(
  'INSERT INTO income (user_id, wallet_id, amount, date, source, notes, is_archived) VALUES (?, ?, ?, ?, ?, ?, 0)'
)
const insertExpense = db.prepare(
  'INSERT INTO expenses (user_id, wallet_id, category, amount, date, notes) VALUES (?, ?, ?, ?, ?, ?)'
)
const insertDebt = db.prepare(
  `INSERT INTO debts (user_id, wallet_id, creditor, total_amount, paid_amount, remaining_amount,
     due_date, payment_type, status, notes, is_archived)
   VALUES (?, ?, ?, ?, 0, ?, NULL, 'no-schedule', 'unpaid', NULL, 0)`
)
const insertPayment = db.prepare(
  `INSERT INTO debt_payments (debt_id, wallet_id, amount, date, notes, payment_type)
   VALUES (?, ?, ?, ?, NULL, 'payment')`
)
const insertTransfer = db.prepare(
  'INSERT INTO wallet_transfers (user_id, from_wallet_id, to_wallet_id, amount, date, notes) VALUES (?, ?, ?, ?, ?, NULL)'
)

const seedStart = performance.now()
const seed = db.transaction(() => {
  for (let i = 0; i < INCOME; i += 1) {
    const walletId = cycle[i % 3]
    insertIncome.run(user.id, walletId, 100, `2026-${String((i % 12) + 1).padStart(2, '0')}-15`, 'Salary', null)
    add(walletId, incomeCents)
  }
  for (let i = 0; i < EXPENSES; i += 1) {
    const walletId = cycle[i % 3]
    insertExpense.run(user.id, walletId, 'food', 25, `2026-${String((i % 12) + 1).padStart(2, '0')}-10`, null)
    add(walletId, -expenseCents)
  }
  const debtIds = []
  for (let i = 0; i < DEBTS; i += 1) {
    const info = insertDebt.run(user.id, bdo.id, `Creditor ${i}`, 1000, 1000)
    debtIds.push(info.lastInsertRowid)
    add(bdo.id, toCents(1000))
  }
  for (const debtId of debtIds) {
    for (let p = 0; p < PAYMENTS; p += 1) {
      insertPayment.run(debtId, bdo.id, 100, '2026-03-15')
      add(bdo.id, -paymentCents)
    }
  }
  for (let i = 0; i < TRANSFERS; i += 1) {
    insertTransfer.run(user.id, bdo.id, gcash.id, 10, '2026-04-01')
    add(bdo.id, -transferCents)
    add(gcash.id, transferCents)
  }
  for (let i = 0; i < ARCHIVED_INCOME; i += 1) {
    db.prepare(
      'INSERT INTO income (user_id, wallet_id, amount, date, source, notes, is_archived) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run(user.id, cash.id, 50, '2026-05-01', 'Old', null)
  }
  for (let i = 0; i < 12; i += 1) {
    db.prepare('INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?)').run(
      user.id,
      `stress-cat-${i}`,
      500
    )
  }
  const goalIds = []
  for (let i = 0; i < GOALS; i += 1) {
    const info = db
      .prepare('INSERT INTO savings_goals (user_id, goal_name, target_amount, current_amount) VALUES (?, ?, ?, 0)')
      .run(user.id, `Goal ${i}`, 10_000)
    goalIds.push(info.lastInsertRowid)
  }
  for (let i = 0; i < CONTRIBUTIONS; i += 1) {
    db.prepare(
      'INSERT INTO savings_contributions (goal_id, amount, date, notes) VALUES (?, ?, ?, NULL)'
    ).run(goalIds[i % goalIds.length], 10, '2026-06-01')
  }
})
seed()
const seedMs = performance.now() - seedStart

const summary = measure('wallets.summary (all rows)', () => walletsRepo.summary(db, user.id))
check('summary has 3 wallets', summary.wallets.length === 3)
for (const wallet of summary.wallets) {
  check(
    `${wallet.name} balance matches seeded rows`,
    toCents(wallet.balance) === expected.get(wallet.id)
  )
}
const expectedTotal = [...expected.values()].reduce((sum, cents) => sum + cents, 0)
check('summary total matches', toCents(summary.total) === expectedTotal)
check('liabilities = outstanding debts', toCents(summary.liabilities) === toCents(DEBTS * 1000))
check('net worth = total - liabilities', toCents(summary.netWorth) === expectedTotal - toCents(DEBTS * 1000))

const incomePage = measure('income page 1', () => incomeRepo.list(db, user.id, { page: 1 }))
check('income total', incomePage.total === INCOME)
check('income page size', incomePage.rows.length === PAGE_SIZE)
check(
  'income last page',
  incomeRepo.list(db, user.id, { page: INCOME / PAGE_SIZE }).rows.length === PAGE_SIZE
)
check('income page past end is empty', incomeRepo.list(db, user.id, { page: INCOME / PAGE_SIZE + 1 }).rows.length === 0)
measure('income search', () => incomeRepo.list(db, user.id, { search: 'Salary' }))

const expensePage = measure('expenses page 1', () => expensesRepo.list(db, user.id, { page: 1 }))
check('expense total', expensePage.total === EXPENSES)
check('expense page size', expensePage.rows.length === PAGE_SIZE)
check(
  'expense last page',
  expensesRepo.list(db, user.id, { page: EXPENSES / PAGE_SIZE }).rows.length === PAGE_SIZE
)

const debtPage = measure('debts page 1', () => debtsRepo.list(db, user.id, { page: 1 }))
check('debt total', debtPage.total === DEBTS)
check('debt page size', debtPage.rows.length === PAGE_SIZE)
measure('debts filter unpaid', () => debtsRepo.list(db, user.id, { status: 'unpaid' }))

const activity100 = measure('wallet activity 100', () => walletsRepo.activity(db, user.id, bdo.id, 100))
check('activity returns 100', activity100.length === 100)
const activity500 = measure('wallet activity 500', () => walletsRepo.activity(db, user.id, bdo.id, 500))
check('activity returns 500', activity500.length === 500)

const monthly = measure('reports.monthlyTotals 2026', () => reportsRepo.monthlyTotals(db, user.id, '2026'))
check('monthly totals has 12 buckets', monthly.length === 12)
measure('reports.rangeTotals', () =>
  reportsRepo.rangeTotals(db, user.id, { from: '2026-01-01', to: '2026-12-31' })
)
measure('reports.categoryBreakdown', () =>
  reportsRepo.categoryBreakdown(db, user.id, { from: '2026-01-01', to: '2026-12-31' })
)
const debtSummary = measure('reports.debtSummary', () => reportsRepo.debtSummary(db, user.id))
check('debt summary outstanding', toCents(debtSummary.outstanding) === toCents(DEBTS * 1000))

measure('dashboard getSummary', () =>
  dashboardRepo.getSummary(db, user.id, { from: '2026-06-01', to: '2026-06-30', month: '2026-06' })
)
const budgets = measure('budgets.listMonthly', () => budgetsRepo.listMonthly(db, user.id, '2026-06'))
check('12 budgets loaded', budgets.length === 12)
const goals = measure('savings.list', () => savingsRepo.list(db, user.id))
check('50 goals loaded', goals.length === GOALS)
measure('savings.totalSaved', () => savingsRepo.totalSaved(db, user.id))
const archived = measure('income.listArchived', () => incomeRepo.listArchived(db, user.id))
check('archived income 1000', archived.length === ARCHIVED_INCOME)
measure('wallets.archived', () => walletsRepo.listArchived(db, user.id))
measure('wallets.activity after archive', () => walletsRepo.activity(db, user.id, bdo.id, 500))

console.log(`\nSeeded ${INCOME + EXPENSES + DEBTS + DEBTS * PAYMENTS + TRANSFERS + ARCHIVED_INCOME + GOALS + CONTRIBUTIONS + 12} rows in ${seedMs.toFixed(0)} ms`)
for (const timing of timings) console.log(`  ${timing.name.padEnd(34)} ${timing.ms.toFixed(1)} ms`)
console.log(`\n${checks} checks, ${failures} failed`)

closeDatabase()
for (const suffix of ['', '-wal', '-shm']) rmSync(`${DB_PATH}${suffix}`, { force: true })
process.exit(failures === 0 ? 0 : 1)
