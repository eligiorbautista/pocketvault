// End-to-end audit of repository CRUD/flows, validation and money handling,
// using the real production code. Bundled with esbuild, run with Node.
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
import {
  ValidationError,
  validateAmount,
  validateCategory,
  validateDate,
  validateId,
  validateInt,
  validatePage,
  validatePassword,
  validatePaymentType,
  validateText,
  validateUsername
} from '../src/main/db/validate.js'
import { fromCents, round2, sumPesos, toCents } from '../src/shared/money.js'

let passed = 0
const failures = []
function check(label, condition, detail) {
  if (!condition) {
    failures.push(label)
    console.error(`FAIL: ${label}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`)
  } else {
    passed += 1
  }
}
function throws(label, fn) {
  try {
    fn()
    check(label, false, 'did not throw')
  } catch (error) {
    check(label, error instanceof ValidationError, error?.name)
  }
}

// ---------- validation ----------
throws('amount 0 rejected', () => validateAmount(0))
throws('amount negative rejected', () => validateAmount(-5))
throws('amount NaN rejected', () => validateAmount('abc'))
throws('amount Infinity rejected', () => validateAmount(Infinity))
check('amount allowZero accepts 0', validateAmount(0, 'amount', { allowZero: true }) === 0)
check('amount rounds to 2dp', validateAmount(1.005) === 1, validateAmount(1.005))
throws('date bad format rejected', () => validateDate('03/01/2026'))
throws('date impossible month rejected', () => validateDate('2026-13-01'))
throws('date required missing rejected', () => validateDate('', 'date'))
check('date optional empty -> null', validateDate('', 'date', { required: false }) === null)
check('date valid accepted', validateDate('2026-03-01') === '2026-03-01')
throws('id 0 rejected', () => validateId(0))
throws('id non-integer rejected', () => validateId(1.5))
throws('id string rejected', () => validateId('x'))
throws('category unknown rejected', () => validateCategory('nope'))
check('category known accepted', validateCategory('food') === 'food')
throws('username short rejected', () => validateUsername('ab'))
throws('username bad chars rejected', () => validateUsername('bad name!'))
check('username valid accepted', validateUsername('alice_1') === 'alice_1')
check('password any length allowed (1 char)', validatePassword('a') === 'a')
check('password empty allowed', validatePassword('') === '')
check('page default 1', validatePage(undefined) === 1)
check('page string coerced', validatePage('2') === 2)
throws('page 0 rejected', () => validatePage(0))
throws('text required empty rejected', () => validateText('   ', 'notes', { required: true }))
check('text trimmed', validateText('  hi  ', 'notes') === 'hi')
throws('text too long rejected', () => validateText('x'.repeat(501), 'notes', { max: 500 }))
throws('int out of range rejected', () => validateInt(32, 'day', { min: 1, max: 31 }))
check('int in range accepted', validateInt(15, 'day', { min: 1, max: 31 }) === 15)
throws('payment type unknown rejected', () => validatePaymentType('weird', ['payment', 'reborrow']))

// ---------- money ----------
check('toCents(0.1)=10', toCents(0.1) === 10)
check('fromCents(10)=0.1', fromCents(10) === 0.1)
check('round2(2.675)=2.68', round2(2.675) === 2.68, round2(2.675))
check('sumPesos([0.1,0.2])===0.3 exact', sumPesos([0.1, 0.2]) === 0.3, sumPesos([0.1, 0.2]))
check('sumPesos empty = 0', sumPesos([]) === 0)
check('sumPesos handles strings', sumPesos(['1.10', '2.20']) === 3.3)

// ---------- database ----------
const dir = mkdtempSync(join(tmpdir(), 'pocketvault-audit-'))
const db = createDatabase(join(dir, 'audit.db'))
const alice = users.createUser(db, { username: 'alice', passwordHash: 'x' })
const bob = users.createUser(db, { username: 'bob', passwordHash: 'y' })

// users
check('duplicate username blocked at repo layer (unique)', (() => {
  try {
    users.createUser(db, { username: 'alice', passwordHash: 'z' })
    return false
  } catch {
    return true
  }
})())
check('findByUsername returns record', users.findByUsername(db, 'alice')?.id === alice.id)
check('findById hides password_hash', !('password_hash' in users.findById(db, alice.id)))
check('exists false for missing', users.exists(db, 9999) === false)

// ---------- income CRUD + pagination + filters ----------
for (let i = 1; i <= 60; i += 1) {
  incomeRepo.create(db, alice.id, {
    amount: i,
    date: '2026-05-01',
    source: i === 30 ? 'UniqueFindMe' : `Src${i}`,
    notes: null,
    receipt_path: null
  })
}
const page1 = incomeRepo.list(db, alice.id, { page: 1 })
const page2 = incomeRepo.list(db, alice.id, { page: 2 })
check('pagination page size 50', page1.rows.length === 50, page1.rows.length)
check('pagination total 60', page1.total === 60)
check('pagination totalPages 2', page1.totalPages === 2, page1.totalPages)
check('pagination page 2 has 10', page2.rows.length === 10, page2.rows.length)
check('pagination pages do not overlap', page1.rows[0].id !== page2.rows[0].id)
check('search matches source', incomeRepo.list(db, alice.id, { search: 'UniqueFindMe' }).total === 1)
check('search is case-insensitive', incomeRepo.list(db, alice.id, { search: 'uniquefindme' }).total === 1)
check('date range inclusive filter', incomeRepo.list(db, alice.id, { from: '2026-05-01', to: '2026-05-01' }).total === 60)
check('date range excludes out of range', incomeRepo.list(db, alice.id, { from: '2026-06-01', to: '2026-06-30' }).total === 0)
const oldest = incomeRepo.list(db, alice.id, { order: 'oldest', pageSize: 1 })
check('order oldest returns first inserted', oldest.rows[0].amount === 1, oldest.rows[0].amount)
const created = incomeRepo.create(db, alice.id, { amount: 12.34, date: '2026-07-01', source: 'Edit', notes: 'n', receipt_path: null })
const updated = incomeRepo.update(db, alice.id, created.id, { amount: 99.99, date: '2026-07-02', source: 'Edited', notes: 'x', receipt_path: null })
check('income update persists', updated.amount === 99.99 && updated.date === '2026-07-02')
check('income update sets updated_at', Boolean(updated.updated_at))
check('income cross-user get blocked', incomeRepo.getById(db, bob.id, created.id) === null)
check('income cross-user update blocked', incomeRepo.update(db, bob.id, created.id, { amount: 1, date: '2026-07-02', source: null, notes: null, receipt_path: null }) === null)
check('income remove works', incomeRepo.remove(db, alice.id, created.id) === true)
check('income remove missing returns false', incomeRepo.remove(db, alice.id, 999999) === false)
check('deleting income keeps other rows', incomeRepo.list(db, alice.id, {}).total === 60)

// ---------- expenses CRUD + filters ----------
const exp = expensesRepo.create(db, alice.id, { category: 'food', amount: 100, date: '2026-05-10', notes: 'lunch' })
expensesRepo.create(db, alice.id, { category: 'transport', amount: 50, date: '2026-05-11', notes: null })
check('expense category filter', expensesRepo.list(db, alice.id, { category: 'food' }).total === 1)
check('expense search filter', expensesRepo.list(db, alice.id, { search: 'lunch' }).total === 1)
const expUpd = expensesRepo.update(db, alice.id, exp.id, { category: 'shopping', amount: 200, date: '2026-05-12', notes: null })
check('expense update persists', expUpd.category === 'shopping' && expUpd.amount === 200)
check('expense cross-user update blocked', expensesRepo.update(db, bob.id, exp.id, { category: 'food', amount: 1, date: '2026-05-12', notes: null }) === null)
check('expense remove works', expensesRepo.remove(db, alice.id, exp.id) === true)
check('expense remove missing false', expensesRepo.remove(db, alice.id, 999999) === false)

// ---------- debts CRUD + payments + reborrow ----------
const debt = debtsRepo.create(db, alice.id, {
  creditor: 'Bank',
  total_amount: 10000,
  due_date: '2026-12-31',
  payment_type: 'fixed-date',
  monthly_amount: null,
  payment_day: null,
  notes: null
})
check('debt starts unpaid/0 remaining delta', debt.paid_amount === 0 && debt.remaining_amount === 10000 && debt.effective_status === 'unpaid')
debtsRepo.addPayment(db, alice.id, debt.id, { amount: 2500, date: '2026-05-05', notes: null })
let d = debtsRepo.getById(db, alice.id, debt.id)
check('debt partial after payment', d.paid_amount === 2500 && d.remaining_amount === 7500 && d.effective_status === 'partial')
debtsRepo.reborrow(db, alice.id, debt.id, { amount: 1000, date: '2026-05-06', notes: null })
d = debtsRepo.getById(db, alice.id, debt.id)
check('reborrow raises total & remaining', d.total_amount === 11000 && d.remaining_amount === 8500, d.remaining_amount)
const payments = debtsRepo.listPayments(db, alice.id, debt.id)
check('payment ledger has 2 entries', payments.length === 2)
debtsRepo.removePayment(db, alice.id, payments.find((p) => p.payment_type === 'reborrow').id)
d = debtsRepo.getById(db, alice.id, debt.id)
check('removing reborrow restores total', d.total_amount === 10000 && d.remaining_amount === 7500)
debtsRepo.addPayment(db, alice.id, debt.id, { amount: 5000, date: '2026-05-07', notes: null })
d = debtsRepo.getById(db, alice.id, debt.id)
check('debt partial after 7500 paid', d.paid_amount === 7500 && d.remaining_amount === 2500 && d.effective_status === 'partial', { paid: d.paid_amount, rem: d.remaining_amount })
debtsRepo.addPayment(db, alice.id, debt.id, { amount: 2500, date: '2026-05-08', notes: null })
d = debtsRepo.getById(db, alice.id, debt.id)
check('debt paid after full payment', d.paid_amount === 10000 && d.remaining_amount === 0 && d.effective_status === 'paid', { paid: d.paid_amount, rem: d.remaining_amount })
debtsRepo.addPayment(db, alice.id, debt.id, { amount: 100, date: '2026-05-09', notes: null })
d = debtsRepo.getById(db, alice.id, debt.id)
check('overpayment clamps remaining at 0', d.remaining_amount === 0 && d.paid_amount === 10100, { paid: d.paid_amount })
check('debt cross-user get blocked', debtsRepo.getById(db, bob.id, debt.id) === null)
check('debt cross-user payments blocked', debtsRepo.listPayments(db, bob.id, debt.id) === null)
check('debt cross-user addPayment returns null', debtsRepo.addPayment(db, bob.id, debt.id, { amount: 1, date: '2026-05-10', notes: null }) === null)
const updatedDebt = debtsRepo.update(db, alice.id, debt.id, { creditor: 'Bank', total_amount: 20000, due_date: '2026-12-31', payment_type: 'fixed-date', monthly_amount: null, payment_day: null, notes: null })
check('debt update recomputes remaining', updatedDebt.remaining_amount === 9900, updatedDebt.remaining_amount)
check('debt remove works', debtsRepo.remove(db, alice.id, debt.id) === true)
check('debt payments cascade after delete', debtsRepo.listPayments(db, alice.id, debt.id) === null)

// monthly debt requires amounts (repo just stores)
const monthlyDebt = debtsRepo.create(db, alice.id, {
  creditor: 'Friend',
  total_amount: 3000,
  due_date: null,
  payment_type: 'monthly',
  monthly_amount: 500,
  payment_day: 15,
  notes: null
})
check('monthly debt stores schedule', monthlyDebt.payment_type === 'monthly' && monthlyDebt.monthly_amount === 500 && monthlyDebt.payment_day === 15)
check('debt status filter unpaid', debtsRepo.list(db, alice.id, { status: 'unpaid' }).total === 1)
check('debt status filter paid', debtsRepo.list(db, alice.id, { status: 'paid' }).total === 0)
check('debt search filter', debtsRepo.list(db, alice.id, { search: 'friend' }).total === 1)
debtsRepo.remove(db, alice.id, monthlyDebt.id)

// ---------- budgets ----------
budgetsRepo.upsert(db, alice.id, { category: 'food', monthly_limit: 1000 })
budgetsRepo.upsert(db, alice.id, { category: 'food', monthly_limit: 2000 })
expensesRepo.create(db, alice.id, { category: 'food', amount: 1500, date: '2026-06-05', notes: null })
const budgetList = budgetsRepo.listMonthly(db, alice.id, '2026-06')
check('budget upsert unique per category', budgetList.filter((b) => b.category === 'food').length === 1)
check('budget limit updated', budgetList[0].monthly_limit === 2000)
check('budget spent for month', budgetList[0].spent === 1500)
check('budget over flag false at 75%', budgetList[0].over === false && budgetList[0].percent === 75)
expensesRepo.create(db, alice.id, { category: 'food', amount: 800, date: '2026-06-20', notes: null })
check('budget over flag true after overspend', budgetsRepo.listMonthly(db, alice.id, '2026-06')[0].over === true)
check('budget spent ignores other months', budgetsRepo.listMonthly(db, alice.id, '2026-07')[0].spent === 0)
check('budget remove works', budgetsRepo.remove(db, alice.id, budgetList[0].id) === true)

// ---------- savings ----------
const goal = savingsRepo.create(db, alice.id, { goal_name: 'Trip', target_amount: 10000, deadline: '2026-12-31' })
const incLink = incomeRepo.create(db, alice.id, { amount: 500, date: '2026-06-01', source: 'Salary', notes: null, receipt_path: null })
savingsRepo.addContribution(db, alice.id, goal.id, { amount: 2500, date: '2026-06-02', income_id: incLink.id, notes: null })
savingsRepo.addContribution(db, alice.id, goal.id, { amount: 1500, date: '2026-06-03', income_id: null, notes: null })
let g = savingsRepo.getById(db, alice.id, goal.id)
check('savings current_amount sums contributions', g.current_amount === 4000 && g.percent === 40, g.percent)
check('totalSaved aggregates', savingsRepo.totalSaved(db, alice.id) === 4000)
const contribs = savingsRepo.listContributions(db, alice.id, goal.id)
check('contribution link preserved', contribs.some((c) => c.income_source === 'Salary'))
savingsRepo.removeContribution(db, alice.id, contribs.find((c) => c.amount === 1500).id)
check('removeContribution recalculates', savingsRepo.getById(db, alice.id, goal.id).current_amount === 2500)
check('savings update persists name/target', savingsRepo.update(db, alice.id, goal.id, { goal_name: 'Big Trip', target_amount: 20000, deadline: null }).target_amount === 20000)
check('savings cross-user get blocked', savingsRepo.getById(db, bob.id, goal.id) === null)
check('savings cross-user contributions blocked', savingsRepo.listContributions(db, bob.id, goal.id) === null)
check('savings remove works', savingsRepo.remove(db, alice.id, goal.id) === true)
check('goal delete cascades contributions', savingsRepo.listContributions(db, alice.id, goal.id) === null)
check('income survives contribution cascade (SET NULL)', incomeRepo.getById(db, alice.id, incLink.id) !== null)

// ---------- reports ----------
incomeRepo.create(db, alice.id, { amount: 0.1, date: '2026-08-01', source: 'A', notes: null, receipt_path: null })
incomeRepo.create(db, alice.id, { amount: 0.2, date: '2026-08-01', source: 'B', notes: null, receipt_path: null })
const range = reportsRepo.rangeTotals(db, alice.id, { from: '2026-08-01', to: '2026-08-31' })
check('rangeTotals exact float sum', range.income === 0.3, range.income)
const monthly = reportsRepo.monthlyTotals(db, alice.id, 2026)
check('monthlyTotals has 12 buckets', monthly.length === 12)
check('monthlyTotals may income summed', monthly[4].income > 0)
check('monthlyTotals net = income - expenses', monthly[4].net === round2(monthly[4].income - monthly[4].expenses))
const breakdown = reportsRepo.categoryBreakdown(db, alice.id, { from: '2026-01-01', to: '2026-12-31' })
check('categoryBreakdown returns food', breakdown.some((c) => c.category === 'food'))
const sources = reportsRepo.incomeBySource(db, alice.id, { from: '2026-01-01', to: '2026-12-31' })
check('incomeBySource groups', sources.length > 0)
const debtSummary = reportsRepo.debtSummary(db, alice.id)
check('debtSummary fields', typeof debtSummary.outstanding === 'number' && typeof debtSummary.overdueCount === 'number')

// ---------- dashboard ----------
const dash = dashboardRepo.getSummary(db, alice.id, '2026-05')
check('dashboard totals numbers', typeof dash.totalIncome === 'number' && typeof dash.remaining === 'number')
check('dashboard recent lists capped', dash.recentIncome.length <= 5 && dash.recentExpenses.length <= 5)
check('dashboard budgets structure', Array.isArray(dash.budgets.items))
check('bob dashboard isolated (no data)', dashboardRepo.getSummary(db, bob.id, '2026-05').totalIncome === 0)

closeDatabase()
rmSync(dir, { recursive: true, force: true })

console.log(`\n${passed} checks passed, ${failures.length} failed`)
if (failures.length) {
  console.error('FAILURES:\n' + failures.map((f) => ' - ' + f).join('\n'))
  process.exit(1)
}
