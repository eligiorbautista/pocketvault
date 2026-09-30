// Capacitor adapter smoke test: bundles the renderer's Capacitor adapter with
// its sqlite module replaced by a better-sqlite3 shim, then exercises the full
// public surface (auth, CRUD, debts math, budgets, savings, reports, account
// wipe) against a real SQLite engine. Verifies the Android data layer logic
// without needing a device/emulator.
import { build } from 'esbuild'
import { writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(import.meta.dirname, '..')

const fsStub = `
export const Directory = { Data: 'DATA', Documents: 'DOCUMENTS', Cache: 'CACHE', External: 'EXTERNAL' }
export const Filesystem = {
  writeFile: async ({ path }) => ({ uri: 'file:///mock/' + path }),
  readFile: async () => ({ data: 'QUJD' }),
  deleteFile: async () => {},
}
`

const sqliteShim = `
import Database from 'better-sqlite3'
import { MIGRATIONS } from './src/shared/schema.js'

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
for (const migration of MIGRATIONS) db.exec(migration)

export async function query(sql, params = []) {
  return db.prepare(sql).all(...params)
}
export async function getOne(sql, params = []) {
  return db.prepare(sql).get(...params) ?? null
}
export async function run(sql, params = []) {
  const info = db.prepare(sql).run(...params)
  return { changes: info.changes, lastId: info.lastInsertRowid }
}
export async function executeSet(statements) {
  const tx = db.transaction(() => {
    for (const entry of statements) db.prepare(entry.statement).run(...(entry.values ?? []))
  })
  return tx()
}
export async function paginate({ select, from, where = [], params = [], orderBy = 'id DESC', page = 1, pageSize = 50 }) {
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const total = db.prepare('SELECT COUNT(*) AS c FROM ' + from + ' ' + whereSql).get(...params).c
  const offset = (page - 1) * pageSize
  const rows = db.prepare(select + ' FROM ' + from + ' ' + whereSql + ' ORDER BY ' + orderBy + ' LIMIT ? OFFSET ?').all(...params, pageSize, offset)
  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}
`

writeFileSync(path.join(ROOT, '.pv-fs-stub.js'), fsStub)
writeFileSync(path.join(ROOT, '.pv-sqlite-shim.js'), sqliteShim)

const OUT = path.join(ROOT, '.pv-cap-api.cjs')
await build({
  entryPoints: [path.join(ROOT, 'src/renderer/src/lib/capacitor/api.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: OUT,
  external: ['better-sqlite3'],
  alias: {
    '@capacitor/filesystem': path.join(ROOT, '.pv-fs-stub.js')
  },
  plugins: [
    {
      name: 'resolve-shared',
      setup(b) {
        b.onResolve({ filter: /^@shared\// }, (args) => ({
          path: path.join(ROOT, 'src/shared', args.path.slice('@shared/'.length))
        }))
        b.onResolve({ filter: /\.\/sqlite(\.js)?$/ }, () => ({ path: path.join(ROOT, '.pv-sqlite-shim.js') }))
      }
    }
  ]
})

const { createCapacitorApi } = require(OUT)

let passed = 0
const failures = []
async function check(name, fn) {
  try {
    const result = await fn()
    if (result === false) throw new Error('returned false')
    passed += 1
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
  }
}
async function expectThrow(name, fn, expected) {
  try {
    await fn()
    failures.push(`${name}: expected an error but none was thrown`)
  } catch (error) {
    if (expected && !String(error.message).includes(expected)) {
      failures.push(`${name}: wrong error "${error.message}" (expected to include "${expected}")`)
    } else {
      passed += 1
    }
  }
}
const near = (a, b) => Math.abs(a - b) < 0.001

const api = createCapacitorApi()

await check('register creates a session', async () => {
  const res = await api.auth.register('alice', 'secret123')
  return res.user.username === 'alice'
})
await expectThrow('duplicate username rejected', () => api.auth.register('alice', 'x'), 'already taken')
await expectThrow('bad username rejected', () => api.auth.register('ab', 'x'), 'username must be')
await expectThrow('login with wrong password throws', () => api.auth.login('alice', 'nope'), 'Invalid username or password')
await check('login works', async () => (await api.auth.login('alice', 'secret123')).user.id === 1)
await check('current returns session', async () => (await api.auth.current()).user.username === 'alice')

await check('settings default', async () => {
  const s = await api.settings.get()
  return s.currency === 'PHP' && s.requirePasswordOnStart === false
})
await check('settings update', async () => {
  const s = await api.settings.update({ currency: 'USD', requirePasswordOnStart: true })
  return s.currency === 'USD' && s.requirePasswordOnStart === true
})

let incomeId
await check('income create', async () => {
  const row = await api.income.create({ amount: 1000.555, date: '2026-09-05', source: 'Salary', notes: 'pay', receipt_path: null })
  incomeId = row.id
  return row.amount === 1000.56 && row.source === 'Salary'
})
await check('income list paginates', async () => {
  const res = await api.income.list({ page: 1 })
  return res.total === 1 && res.rows.length === 1 && res.totalPages === 1
})
await check('income update', async () => {
  const row = await api.income.update(incomeId, { amount: 2000, date: '2026-09-06', source: 'Salary', notes: null, receipt_path: null })
  return row.amount === 2000
})
await check('income all', async () => (await api.income.all({ from: '2026-01-01', to: '2026-12-31' })).length === 1)

await check('expense create + custom category', async () => {
  const row = await api.expenses.create({ category: 'Pet care', amount: 300, date: '2026-09-07', notes: 'vet' })
  return row.category === 'Pet care'
})
await expectThrow('expense bad category rejected', () => api.expenses.create({ category: '@@', amount: 1, date: '2026-09-07' }), 'category is not recognized')
await expectThrow('expense bad date rejected', () => api.expenses.create({ category: 'food', amount: 1, date: '09/07/2026' }), 'YYYY-MM-DD')
await expectThrow('expense zero amount rejected', () => api.expenses.create({ category: 'food', amount: 0, date: '2026-09-07' }), 'greater than zero')

let debtId
await check('debt create (monthly)', async () => {
  const row = await api.debts.create({ creditor: 'Home Credit', total_amount: 30000, due_date: '2026-12-15', payment_type: 'monthly', monthly_amount: 2500, first_payment_date: '2026-09-15', notes: null })
  debtId = row.id
  return row.remaining_amount === 30000 && row.effective_status === 'unpaid'
})
await check('add payment recomputes balance', async () => {
  const row = await api.debts.addPayment(debtId, { amount: 2500, date: '2026-09-15', notes: null, installment_due: '2026-09-15' })
  return row.paid_amount === 2500 && row.remaining_amount === 27500 && row.effective_status === 'partial'
})
await check('add second payment', async () => {
  const row = await api.debts.addPayment(debtId, { amount: 2500, date: '2026-09-16', notes: 'extra', installment_due: '2026-10-15' })
  return row.paid_amount === 5000 && row.remaining_amount === 25000 && row.effective_status === 'partial'
})
await check('remove payment recomputes balance', async () => {
  const payments = await api.debts.payments(debtId)
  const row = await api.debts.removePayment(payments[1].id)
  return row.paid_amount === 2500 && row.remaining_amount === 27500
})
await check('debt list decorates status', async () => {
  const res = await api.debts.list({ status: 'partial' })
  return res.total === 1 && res.rows[0].effective_status === 'partial'
})
await check('monthly debt stores derived payment_day', async () => {
  const row = await api.debts.get(debtId)
  return row.first_payment_date === '2026-09-15' && row.payment_day === 15
})
await expectThrow(
  'monthly debt without first payment date rejected',
  () => api.debts.create({ creditor: 'X', total_amount: 1000, payment_type: 'monthly', monthly_amount: 100 }),
  'first payment date'
)
await expectThrow(
  'fixed-date debt without due date rejected',
  () => api.debts.create({ creditor: 'X', total_amount: 1000, payment_type: 'fixed-date' }),
  'due date'
)
await expectThrow(
  'debt with bad receipt reference rejected',
  () => api.debts.create({ creditor: 'X', total_amount: 1000, payment_type: 'no-schedule', receipt_path: '../evil.png' }),
  'Invalid receipt'
)

await check('budget upsert + monthly spend', async () => {
  await api.budgets.upsert({ category: 'food', monthly_limit: 1000 })
  await api.expenses.create({ category: 'food', amount: 1200, date: '2026-09-08', notes: null })
  const list = await api.budgets.list('2026-09')
  return list.length === 1 && list[0].spent === 1200 && list[0].over === true
})
await expectThrow('budget upsert rejects bad limit', () => api.budgets.upsert({ category: 'food', monthly_limit: 0 }), 'greater than zero')

let goalId
await check('savings goal + contribution sync', async () => {
  const goal = await api.savings.create({ goal_name: 'Emergency fund', target_amount: 50000, deadline: null })
  goalId = goal.id
  const after = await api.savings.addContribution(goalId, { amount: 12000, income_id: incomeId, date: '2026-09-09', notes: null })
  return after.current_amount === 12000 && after.percent === 24
})
await check('remove contribution syncs down', async () => {
  const contribs = await api.savings.contributions(goalId)
  const after = await api.savings.removeContribution(contribs[0].id)
  return after.current_amount === 0
})
await check('savings list decorates', async () => (await api.savings.list())[0].complete === false)

await check('dashboard month / range / all', async () => {
  const month = await api.reports.dashboard({ mode: 'month', month: '2026-09' })
  const range = await api.reports.dashboard({ mode: 'range', from: '2026-09-01', to: '2026-09-30' })
  const all = await api.reports.dashboard({ mode: 'all' })
  return near(month.totalIncome, 2000) && near(range.totalExpenses, 1500) && all.budgetMonth === new Date().toISOString().slice(0, 7)
})
await check('dashboard rejects inverted range', async () => {
  try {
    await api.reports.dashboard({ mode: 'range', from: '2026-09-30', to: '2026-09-01' })
    return false
  } catch {
    return true
  }
})
await check('monthlyTotals year = 12 buckets', async () => (await api.reports.monthlyTotals('2026')).length === 12)
await check('monthlyTotals range = data-bounded buckets', async () => (await api.reports.monthlyTotals({ from: '2026-01-01', to: '2026-12-31' })).length === 1)
await check('categoryBreakdown + incomeBySource + debtSummary', async () => {
  const cats = await api.reports.categoryBreakdown({ from: '2026-01-01', to: '2026-12-31' })
  const sources = await api.reports.incomeBySource({ from: '2026-01-01', to: '2026-12-31' })
  const debts = await api.reports.debtSummary()
  return cats.length === 2 && sources.length === 1 && debts.outstanding === 27500
})

await check('receipt read returns dataUrl', async () => (await api.files.readReceipt('abc.png')).dataUrl.startsWith('data:image/png;base64,'))
await check('saveExport writes via filesystem', async () => (await api.files.saveExport({ defaultName: 'report.csv', data: new Uint8Array([1, 2, 3]) })).saved === true)
await check('backup export writes json', async () => (await api.backup.export()).saved === true)
await expectThrow('backup import reports unsupported', () => api.backup.import(), 'not available on mobile')
await expectThrow('openReceipt reports unsupported', () => api.files.openReceipt('abc.png'), 'not supported on mobile')

await expectThrow('deleteData rejects wrong password', () => api.account.deleteData('nope'), 'Password is incorrect')
await check('deleteData wipes records but keeps account', async () => {
  const res = await api.account.deleteData('secret123')
  const dashboard = await api.reports.dashboard({ mode: 'all' })
  const stillLoggedIn = await api.auth.current()
  return res.deleted === true && dashboard.totalIncome === 0 && stillLoggedIn.user.username === 'alice'
})
await check('login still works after deleteData', async () => (await api.auth.login('alice', 'secret123')).user.id === 1)

rmSync(OUT, { force: true })
rmSync(path.join(ROOT, '.pv-fs-stub.js'), { force: true })
rmSync(path.join(ROOT, '.pv-sqlite-shim.js'), { force: true })

console.log(`\nCapacitor adapter audit: ${passed} passed, ${failures.length} failed`)
for (const f of failures) console.log('  FAIL - ' + f)
process.exit(failures.length ? 1 : 0)
