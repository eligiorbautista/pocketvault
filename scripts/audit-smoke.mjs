// End-to-end audit of repository CRUD/flows, validation and money handling,
// using the real production code. Bundled with esbuild, run with Node.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
import * as settingsRepo from '../src/main/db/repositories/settings.js'
import { deleteUserData } from '../src/main/services/data.js'
import { reconcileReceipts } from '../src/main/services/receiptCleanup.js'
import {
  currencyCodes,
  currencyName,
  currencySymbol,
  formatMoney,
  isValidCurrency
} from '../src/shared/currency.js'
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
import {
  buildInstallments,
  buildReminderPlan,
  effectiveDueDate,
  installmentStatus,
  nextUnpaidInstallment
} from '../src/shared/reminders.js'
import {
  backupRowCounts,
  validateBackupData,
  verifyBackupCounts
} from '../src/shared/backupValidate.js'

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
throws('date impossible calendar day rejected', () => validateDate('2026-02-31'))
throws('date impossible april day rejected', () => validateDate('2026-04-31'))
throws('date required missing rejected', () => validateDate('', 'date'))
check('date optional empty -> null', validateDate('', 'date', { required: false }) === null)
check('date valid accepted', validateDate('2026-03-01') === '2026-03-01')
check('date leap day accepted', validateDate('2024-02-29') === '2024-02-29')
throws('non-leap feb 29 rejected', () => validateDate('2026-02-29'))
check('date year < 100 accepted (range sentinel)', validateDate('0001-01-01') === '0001-01-01')
check('date year 0099 accepted', validateDate('0099-12-31') === '0099-12-31')
throws('impossible early-year date still rejected', () => validateDate('0099-02-30'))
throws('id 0 rejected', () => validateId(0))
throws('id non-integer rejected', () => validateId(1.5))
throws('id string rejected', () => validateId('x'))
check('unknown category treated as custom', validateCategory('nope') === 'nope')
check('category known accepted', validateCategory('food') === 'food')
check('custom category accepted', validateCategory('Pet care') === 'Pet care')
throws('empty category rejected', () => validateCategory('   '))
throws('category with path chars rejected', () => validateCategory('bad/../x'))
throws('username short rejected', () => validateUsername('ab'))
throws('username bad chars rejected', () => validateUsername('bad name!'))
check('username valid accepted', validateUsername('alice_1') === 'alice_1')
check('password accepted when valid', validatePassword('secret1') === 'secret1')
throws('password empty rejected', () => validatePassword(''))
throws('password too short rejected', () => validatePassword('abc'))
throws('password too long rejected', () => validatePassword('x'.repeat(129)))
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

// ---------- currency ----------
check('currency list is large (ISO 4217)', currencyCodes().length > 100, currencyCodes().length)
check('PHP valid', isValidCurrency('PHP') === true)
check('USD valid', isValidCurrency('USD') === true)
check('bogus currency rejected', isValidCurrency('NOPE') === false)
check('USD symbol is $', currencySymbol('USD') === '$', currencySymbol('USD'))
check('EUR symbol is €', currencySymbol('EUR') === '€', currencySymbol('EUR'))
check('formatMoney USD uses symbol', formatMoney(1234.5, 'USD').includes('$'), formatMoney(1234.5, 'USD'))
check('currencyName USD defined', (currencyName('USD') || '').length > 0)

// ---------- backup validation ----------
check(
  'backup validation accepts a well-formed payload',
  (() => {
    validateBackupData({
      income: [{ amount: 100, date: '2026-01-01', source: 'Salary' }],
      expenses: [{ category: 'food', amount: 5, date: '2026-01-02' }],
      debts: [{ creditor: 'Bank', total_amount: 10, paid_amount: 0, remaining_amount: 10 }],
      debt_payments: [],
      budgets: [{ category: 'food', monthly_limit: 50 }],
      savings_goals: [{ goal_name: 'Trip', target_amount: 100, current_amount: 0 }],
      savings_contributions: []
    })
    return true
  })()
)
throws('backup validation rejects non-numeric amount', () =>
  validateBackupData({ income: [{ amount: 'abc', date: '2026-01-01' }] })
)
throws('backup validation rejects impossible date', () =>
  validateBackupData({ expenses: [{ category: 'food', amount: 5, date: '2026-02-31' }] })
)
throws('backup validation rejects bad category', () =>
  validateBackupData({ expenses: [{ category: 'bad/../x', amount: 5, date: '2026-01-02' }] })
)
throws('backup validation rejects bad receipt path', () =>
  validateBackupData({ income: [{ amount: 1, date: '2026-01-01', receipt_path: '../evil.png' }] })
)
check(
  'backup validation accepts legacy 120-char income source',
  (() => {
    validateBackupData({
      income: [{ amount: 1, date: '2026-01-01', source: 'x'.repeat(120) }]
    })
    return true
  })()
)
throws('backup validation rejects over-long income source', () =>
  validateBackupData({ income: [{ amount: 1, date: '2026-01-01', source: 'x'.repeat(121) }] })
)
check(
  'backupRowCounts maps rows',
  backupRowCounts({ income: [1, 2], expenses: [1] }).income === 2 &&
    backupRowCounts({ income: [1, 2], expenses: [1] }).expenses === 1
)
check(
  'backup count mismatch rejected',
  (() => {
    try {
      verifyBackupCounts({ counts: { income: 2 } }, { income: [1] }, 0)
      return false
    } catch {
      return true
    }
  })()
)
check(
  'backup count match accepted',
  (() => {
    verifyBackupCounts(
      { counts: { income: 2, receipts: 0 } },
      { income: [1, 2] },
      0
    )
    return true
  })()
)

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
check('findByUsername is case-insensitive', users.findByUsername(db, 'ALICE')?.id === alice.id)
check('findByUsername case-insensitive misses real absent', users.findByUsername(db, 'nobody') === null)
check('findById hides password_hash', !('password_hash' in users.findById(db, alice.id)))
check('exists false for missing', users.exists(db, 9999) === false)
const record = users.getRecordById(db, alice.id)
check('getRecordById returns the password hash (main-only)', typeof record?.password_hash === 'string')
check('updatePassword persists a new hash', (() => {
  const before = record.password_hash
  const ok = users.updatePassword(db, alice.id, 'rehashed-value')
  const after = users.getRecordById(db, alice.id).password_hash
  return ok === true && after === 'rehashed-value' && after !== before
})())
check('updatePassword missing user returns false', users.updatePassword(db, 9999, 'x') === false)

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
check('expense distinct categories exclude archived', (() => {
  const cats = expensesRepo.distinctCategories(db, alice.id)
  return cats.includes('transport') && !cats.includes('shopping')
})())

// ---------- debts CRUD + payments ----------
const debt = debtsRepo.create(db, alice.id, {
  creditor: 'Bank',
  total_amount: 10000,
  due_date: '2026-12-31',
  payment_type: 'fixed-date',
  monthly_amount: null,
  payment_day: null,
  first_payment_date: null,
  notes: null
})
check('debt starts unpaid/0 remaining delta', debt.paid_amount === 0 && debt.remaining_amount === 10000 && debt.effective_status === 'unpaid')
debtsRepo.addPayment(db, alice.id, debt.id, { amount: 2500, date: '2026-05-05', notes: null })
let d = debtsRepo.getById(db, alice.id, debt.id)
check('debt partial after payment', d.paid_amount === 2500 && d.remaining_amount === 7500 && d.effective_status === 'partial')
const payments = debtsRepo.listPayments(db, alice.id, debt.id)
check('payment ledger has 1 entry', payments.length === 1)
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
check('archiving debt keeps its payments', (debtsRepo.listPayments(db, alice.id, debt.id) ?? []).length > 0)
check('archived debt hidden from active list', debtsRepo.list(db, alice.id, {}).rows.every((r) => r.id !== debt.id))
check('archived debt appears in archive list', debtsRepo.listArchived(db, alice.id).some((r) => r.id === debt.id))
check('restoring debt returns it to active list', debtsRepo.restore(db, alice.id, debt.id) === true && debtsRepo.list(db, alice.id, {}).rows.some((r) => r.id === debt.id))
debtsRepo.remove(db, alice.id, debt.id)

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
check('archiving goal keeps contributions', (savingsRepo.listContributions(db, alice.id, goal.id) ?? []).length === 1)
check('archived goal hidden from active list', savingsRepo.list(db, alice.id).every((r) => r.id !== goal.id))
check('restoring goal returns it to active list', savingsRepo.restore(db, alice.id, goal.id) === true && savingsRepo.list(db, alice.id).some((r) => r.id === goal.id))
savingsRepo.remove(db, alice.id, goal.id)
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

// ---------- settings ----------
check('settings default currency PHP', settingsRepo.getSettings(db, alice.id).currency === 'PHP')
check('settings default require-password off', settingsRepo.getSettings(db, alice.id).requirePasswordOnStart === false)
settingsRepo.upsertSettings(db, alice.id, { currency: 'USD', requirePasswordOnStart: true })
check('settings persist currency', settingsRepo.getSettings(db, alice.id).currency === 'USD')
check('settings persist require-password', settingsRepo.getSettings(db, alice.id).requirePasswordOnStart === true)
settingsRepo.upsertSettings(db, alice.id, { currency: 'EUR' })
const patched = settingsRepo.getSettings(db, alice.id)
check('settings partial update keeps other field', patched.currency === 'EUR' && patched.requirePasswordOnStart === true)

// ---------- reminder settings ----------
const defaultSettings = settingsRepo.getSettings(db, alice.id)
check('settings default reminders off', defaultSettings.remindersEnabled === false)
check('settings default lead days 3', defaultSettings.reminderLeadDays === 3)
settingsRepo.upsertSettings(db, alice.id, { remindersEnabled: true, reminderLeadDays: 5 })
const remSettings = settingsRepo.getSettings(db, alice.id)
check('settings persist reminders', remSettings.remindersEnabled === true && remSettings.reminderLeadDays === 5)
settingsRepo.upsertSettings(db, alice.id, { currency: 'USD' })
check('settings partial keeps reminders', settingsRepo.getSettings(db, alice.id).reminderLeadDays === 5)
settingsRepo.upsertSettings(db, alice.id, { reminderLeadDays: 0 })
check('settings allow zero lead days', settingsRepo.getSettings(db, alice.id).reminderLeadDays === 0)

// ---------- reminder plan (pure) ----------
const now = new Date('2026-06-10T08:00:00')
const fixedDebt = {
  id: 1,
  creditor: 'Bank',
  payment_type: 'fixed-date',
  due_date: '2026-06-20',
  remaining_amount: 500,
  is_archived: 0
}
const fixedPlan = buildReminderPlan([fixedDebt], {}, { leadDays: 3, now })
check('reminder plan has upcoming + due', fixedPlan.length === 2, fixedPlan.length)
check('reminder upcoming precedes due', fixedPlan[0].kind === 'upcoming' && fixedPlan[0].dueDate === '2026-06-20')
check('reminder fires at 9am local', fixedPlan[0].at.getHours() === 9)
const overduePlan = buildReminderPlan([{ ...fixedDebt, due_date: '2026-06-01' }], {}, { leadDays: 3, now })
check('overdue debt yields one overdue reminder', overduePlan.length === 1 && overduePlan[0].kind === 'overdue')
check('paid debt yields no reminders', buildReminderPlan([{ ...fixedDebt, remaining_amount: 0 }], {}, { now }).length === 0)
const planMonthlyDebt = {
  id: 2,
  creditor: 'Home Credit',
  payment_type: 'monthly',
  total_amount: 3000,
  monthly_amount: 1000,
  first_payment_date: '2026-06-15',
  remaining_amount: 3000,
  is_archived: 0,
  created_at: '2026-06-01 00:00:00'
}
const installments = buildInstallments(planMonthlyDebt)
check('installments count with remainder', installments.length === 3 && installments[2].amount === 1000, installments.length)
check('installments step by one month', installments[1].due_date === '2026-07-15')
check('next unpaid is first installment', nextUnpaidInstallment(planMonthlyDebt, []).due_date === '2026-06-15')
check(
  'next unpaid advances after a payment',
  nextUnpaidInstallment(planMonthlyDebt, [{ installment_due: '2026-06-15', amount: 1000 }]).due_date === '2026-07-15'
)
check('effectiveDueDate uses due_date for fixed', effectiveDueDate(fixedDebt, []) === '2026-06-20')
check('monthly plan schedules later installments', buildReminderPlan([planMonthlyDebt], { 2: [] }, { leadDays: 2, now }).length >= 3)
check(
  'monthly reminder uses the installment amount',
  buildReminderPlan([planMonthlyDebt], { 2: [] }, { leadDays: 0, now })
    .find((reminder) => reminder.kind === 'due')
    .body.includes('1,000.00')
)
check('installmentStatus paid', installmentStatus(1000, 1000, '2026-06-15', '2026-06-20') === 'paid')
check('installmentStatus overdue', installmentStatus(0, 1000, '2026-06-15', '2026-06-20') === 'overdue')

// ---------- receipt reconciliation ----------
const recDir = join(dir, 'reconcile-receipts')
mkdirSync(recDir, { recursive: true })
const keepReceipt = '33333333-3333-3333-3333-333333333333.png'
const orphanReceipt = '44444444-4444-4444-4444-444444444444.png'
writeFileSync(join(recDir, keepReceipt), Buffer.from('k'))
writeFileSync(join(recDir, orphanReceipt), Buffer.from('o'))
incomeRepo.create(db, alice.id, { amount: 1, date: '2026-10-01', source: 'Rec', notes: null, receipt_path: keepReceipt })
const removedCount = reconcileReceipts(db, recDir)
check('reconcile removes orphan receipt', removedCount === 1 && !existsSync(join(recDir, orphanReceipt)))
check('reconcile keeps referenced receipt', existsSync(join(recDir, keepReceipt)))

// ---------- delete all data (account kept) ----------
const delReceipts = join(dir, 'del-receipts')
mkdirSync(delReceipts, { recursive: true })
const delReceipt = '22222222-2222-2222-2222-222222222222.png'
writeFileSync(join(delReceipts, delReceipt), Buffer.from('x'))
incomeRepo.create(db, alice.id, { amount: 5, date: '2026-09-01', source: 'Del', notes: null, receipt_path: delReceipt })
incomeRepo.create(db, bob.id, { amount: 7, date: '2026-09-01', source: 'BobKeep', notes: null, receipt_path: null })
const bobBeforeDelete = incomeRepo.list(db, bob.id, {}).total
const delCounts = deleteUserData(db, alice.id, delReceipts)
check('deleteUserData removed all alice income', incomeRepo.list(db, alice.id, {}).total === 0)
check('deleteUserData removed all alice expenses', expensesRepo.list(db, alice.id, {}).total === 0)
check('deleteUserData removed all alice debts', debtsRepo.list(db, alice.id, {}).total === 0)
check('deleteUserData removed all alice budgets', budgetsRepo.listMonthly(db, alice.id, '2026-06').length === 0)
check('deleteUserData removed all alice goals', savingsRepo.list(db, alice.id).length === 0)
check('deleteUserData removed alice receipt file', !existsSync(join(delReceipts, delReceipt)))
check('deleteUserData reports receipt count', delCounts.receipts === 1, delCounts.receipts)
check('deleteUserData keeps the account', users.exists(db, alice.id) === true)
check('deleteUserData keeps other users data', incomeRepo.list(db, bob.id, {}).total === bobBeforeDelete && bobBeforeDelete === 1)

closeDatabase()
rmSync(dir, { recursive: true, force: true })

console.log(`\n${passed} checks passed, ${failures.length} failed`)
if (failures.length) {
  console.error('FAILURES:\n' + failures.map((f) => ' - ' + f).join('\n'))
  process.exit(1)
}
