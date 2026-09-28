// Verifies per-account backup isolation using the real service + repositories.
// Bundled with esbuild and run with Node against temporary SQLite files.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createDatabase, closeDatabase } from '../src/main/db/connection.js'
import * as users from '../src/main/db/repositories/users.js'
import * as incomeRepo from '../src/main/db/repositories/income.js'
import * as expensesRepo from '../src/main/db/repositories/expenses.js'
import * as debtsRepo from '../src/main/db/repositories/debts.js'
import * as budgetsRepo from '../src/main/db/repositories/budgets.js'
import * as savingsRepo from '../src/main/db/repositories/savings.js'
import { buildUserBackup, parseUserBackup, applyUserBackup } from '../src/main/services/backup.js'

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

const receiptName = '11111111-1111-1111-1111-111111111111.png'

function seedAlice(db, receipts) {
  const alice = users.createUser(db, { username: 'alice', passwordHash: 'x' })
  const i1 = incomeRepo.create(db, alice.id, {
    amount: 25000,
    date: '2026-03-01',
    source: 'Salary',
    notes: null,
    receipt_path: receiptName
  })
  incomeRepo.create(db, alice.id, {
    amount: 5000,
    date: '2026-03-15',
    source: 'Freelance',
    notes: null,
    receipt_path: null
  })
  expensesRepo.create(db, alice.id, { category: 'food', amount: 1500, date: '2026-03-05', notes: null })
  const debt = debtsRepo.create(db, alice.id, {
    creditor: 'Landlord',
    total_amount: 10000,
    due_date: '2026-12-31',
    payment_type: 'fixed-date',
    monthly_amount: null,
    payment_day: null,
    notes: null
  })
  debtsRepo.addPayment(db, alice.id, debt.id, { amount: 4000, date: '2026-03-06', notes: null })
  budgetsRepo.upsert(db, alice.id, { category: 'food', monthly_limit: 2000 })
  const goal = savingsRepo.create(db, alice.id, {
    goal_name: 'Emergency fund',
    target_amount: 50000,
    deadline: '2026-12-31'
  })
  savingsRepo.addContribution(db, alice.id, goal.id, {
    amount: 10000,
    date: '2026-03-02',
    income_id: i1.id,
    notes: null
  })
  if (receipts) {
    mkdirSync(receipts, { recursive: true })
    writeFileSync(join(receipts, receiptName), Buffer.from('fake-image-bytes'))
  }
  return alice.id
}

function seedBob(db) {
  const bob = users.createUser(db, { username: 'bob', passwordHash: 'y' })
  incomeRepo.create(db, bob.id, {
    amount: 9999,
    date: '2026-03-10',
    source: 'BobBiz',
    notes: 'private',
    receipt_path: null
  })
  expensesRepo.create(db, bob.id, { category: 'shopping', amount: 777, date: '2026-03-11', notes: null })
  return bob.id
}

const dir = mkdtempSync(join(tmpdir(), 'pocketvault-backup-'))
const sourceReceipts = join(dir, 'receipts-src')

async function main() {
  // --- Source database: alice + bob ---
  const dbA = createDatabase(join(dir, 'a.db'))
const aliceId = seedAlice(dbA, sourceReceipts)
const bobId = seedBob(dbA)

const { buffer, username, counts } = await buildUserBackup(dbA, aliceId, sourceReceipts)
check('backup filename username is alice', username === 'alice')
check('backup counts alice income = 2', counts.income === 2, counts)
check('backup counts alice expenses = 1', counts.expenses === 1)
check('backup counts alice debts = 1', counts.debts === 1)
check('backup counts alice debt payments = 1', counts.debtPayments === 1)
check('backup counts alice budgets = 1', counts.budgets === 1)
check('backup counts alice goals = 1', counts.savingsGoals === 1)
check('backup counts alice contributions = 1', counts.savingsContributions === 1)
check('backup includes 1 receipt', counts.receipts === 1, counts.receipts)
closeDatabase()

const parsed = await parseUserBackup(buffer)
check('parsed username is alice', parsed.account.username === 'alice')
check('parsed income has no user_id column leak', !('user_id' in parsed.data.income[0]))
check(
  'parsed income contains only alice sources',
  parsed.data.income.every((r) => ['Salary', 'Freelance'].includes(r.source))
)
check(
  'bob data is NOT present anywhere in the backup payload',
  !JSON.stringify(parsed.data).includes('BobBiz') && !JSON.stringify(parsed.data).includes('bob')
)
check('parsed receipts included', parsed.receipts.length === 1 && parsed.receipts[0].name === receiptName)

// --- Target database: alice with different data + bob ---
const destReceipts = join(dir, 'receipts-dest')
const dbB = createDatabase(join(dir, 'b.db'))
const aliceB = users.createUser(dbB, { username: 'alice', passwordHash: 'z' })
incomeRepo.create(dbB, aliceB.id, { amount: 1, date: '2026-01-01', source: 'Junk', notes: null, receipt_path: null })
expensesRepo.create(dbB, aliceB.id, { category: 'misc', amount: 2, date: '2026-01-01', notes: null })
const bobB = seedBob(dbB)
const bobIncomeBefore = incomeRepo.list(dbB, bobB, {}).total
const bobExpensesBefore = expensesRepo.list(dbB, bobB, {}).total

const beforeProfile = applyUserBackup(dbB, aliceB.id, parsed, destReceipts)
check('import reports alice restored counts', beforeProfile.counts.income === 2, beforeProfile.counts)

check('alice income replaced (junk gone)', incomeRepo.list(dbB, aliceB.id, {}).total === 2)
check(
  'alice junk row removed',
  !incomeRepo.list(dbB, aliceB.id, {}).rows.some((r) => r.source === 'Junk')
)
check('alice expenses replaced', expensesRepo.list(dbB, aliceB.id, {}).total === 1)
check('alice debt restored with payment', debtsRepo.getById(dbB, aliceB.id, debtsRepo.list(dbB, aliceB.id, {}).rows[0].id).paid_amount === 4000)
check('alice budget restored', budgetsRepo.listMonthly(dbB, aliceB.id, '2026-03').length === 1)
const aliceGoals = savingsRepo.list(dbB, aliceB.id)
check('alice savings goal restored', aliceGoals.length === 1 && aliceGoals[0].current_amount === 10000)
const aliceIncomeIds = incomeRepo.list(dbB, aliceB.id, {}).rows.map((r) => r.id)
const contributions = savingsRepo.listContributions(dbB, aliceB.id, aliceGoals[0].id)
check(
  'savings contribution income link remapped to an alice income id',
  contributions.length === 1 && aliceIncomeIds.includes(contributions[0].income_id),
  contributions[0]?.income_id
)
check('alice receipt restored on disk', existsSync(join(destReceipts, receiptName)))

// --- Other account untouched ---
check('bob income untouched after import', incomeRepo.list(dbB, bobB, {}).total === bobIncomeBefore)
check('bob expenses untouched after import', expensesRepo.list(dbB, bobB, {}).total === bobExpensesBefore)
check(
  'bob still sees his own source',
  incomeRepo.list(dbB, bobB, {}).rows[0].source === 'BobBiz'
)

// --- Username guard behaviour (what the IPC enforces) ---
check('import guard would reject a different account', parsed.account.username !== 'bob')

// --- Idempotent: importing twice yields same result ---
applyUserBackup(dbB, aliceB.id, parsed, destReceipts)
check('second import is idempotent for alice income', incomeRepo.list(dbB, aliceB.id, {}).total === 2)
check('second import still leaves bob intact', incomeRepo.list(dbB, bobB, {}).total === bobIncomeBefore)
closeDatabase()

rmSync(dir, { recursive: true, force: true })
console.log(`\n${passed} checks passed`)
}

main()
