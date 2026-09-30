import JSZip from 'jszip'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  MAX_BACKUP_RECEIPTS_BYTES,
  MAX_RECEIPT_BYTES,
  RECEIPT_FILE_PATTERN
} from '../../shared/constants.js'

const FORMAT = 2
const RECEIPTS_PREFIX = 'receipts/'
const DATA_KEYS = [
  'income',
  'expenses',
  'debts',
  'debt_payments',
  'budgets',
  'savings_goals',
  'savings_contributions'
]

function num(value) {
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

// Builds a backup that contains ONLY the given user's rows and receipts.
export async function buildUserBackup(db, userId, receiptsDir) {
  const user = db
    .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
    .get(userId)
  if (!user) throw new Error('Account not found')

  const income = db
    .prepare(
      `SELECT id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at
       FROM income WHERE user_id = ? ORDER BY id`
    )
    .all(userId)
  const expenses = db
    .prepare(
      `SELECT category, amount, date, notes, is_archived, created_at, updated_at
       FROM expenses WHERE user_id = ? ORDER BY id`
    )
    .all(userId)
  const debts = db
    .prepare(
      `SELECT id, creditor, total_amount, paid_amount, remaining_amount, due_date,
              payment_type, monthly_amount, payment_day, first_payment_date, receipt_path,
              status, notes, is_archived, created_at, updated_at
       FROM debts WHERE user_id = ? ORDER BY id`
    )
    .all(userId)
  const debtIds = debts.map((row) => row.id)
  const debt_payments = debtIds.length
    ? db
        .prepare(
          `SELECT debt_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at
           FROM debt_payments WHERE debt_id IN (${debtIds.map(() => '?').join(',')}) ORDER BY id`
        )
        .all(...debtIds)
    : []
  const budgets = db
    .prepare(
      `SELECT category, monthly_limit, is_archived, created_at, updated_at
       FROM budgets WHERE user_id = ? ORDER BY id`
    )
    .all(userId)
  const savings_goals = db
    .prepare(
      `SELECT id, goal_name, target_amount, current_amount, deadline, is_archived, created_at, updated_at
       FROM savings_goals WHERE user_id = ? ORDER BY id`
    )
    .all(userId)
  const goalIds = savings_goals.map((row) => row.id)
  const savings_contributions = goalIds.length
    ? db
        .prepare(
          `SELECT goal_id, income_id, amount, date, notes, created_at
           FROM savings_contributions
           WHERE goal_id IN (${goalIds.map(() => '?').join(',')}) ORDER BY id`
        )
        .all(...goalIds)
    : []

  const zip = new JSZip()
  const counts = {
    income: income.length,
    expenses: expenses.length,
    debts: debts.length,
    debtPayments: debt_payments.length,
    budgets: budgets.length,
    savingsGoals: savings_goals.length,
    savingsContributions: savings_contributions.length,
    receipts: 0
  }

  zip.file(
    'account.json',
    JSON.stringify({ username: user.username, created_at: user.created_at }, null, 2)
  )
  zip.file(
    'data.json',
    JSON.stringify(
      {
        income,
        expenses,
        debts,
        debt_payments,
        budgets,
        savings_goals,
        savings_contributions
      },
      null,
      2
    )
  )

  if (existsSync(receiptsDir)) {
    const folder = zip.folder('receipts')
    const seen = new Set()
    const receiptRefs = [
      ...income.map((row) => row.receipt_path),
      ...debts.map((row) => row.receipt_path),
      ...debt_payments.map((row) => row.receipt_path)
    ]
    for (const name of receiptRefs) {
      if (!name || seen.has(name) || !RECEIPT_FILE_PATTERN.test(name)) continue
      const full = join(receiptsDir, name)
      if (!existsSync(full)) continue
      seen.add(name)
      folder.file(name, readFileSync(full))
      counts.receipts += 1
    }
  }

  // Written last so the manifest reports the final receipt count.
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        app: 'PocketVault',
        format: FORMAT,
        username: user.username,
        createdAt: new Date().toISOString(),
        counts
      },
      null,
      2
    )
  )

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return { buffer, username: user.username, counts }
}

export async function parseUserBackup(buffer) {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('Invalid backup file: not a readable ZIP archive')
  }

  const manifestEntry = zip.file('manifest.json')
  const accountEntry = zip.file('account.json')
  const dataEntry = zip.file('data.json')
  if (!manifestEntry || !accountEntry || !dataEntry) {
    throw new Error('Invalid backup: this is not a PocketVault account backup')
  }

  let manifest
  let account
  let data
  try {
    manifest = JSON.parse(await manifestEntry.async('string'))
    account = JSON.parse(await accountEntry.async('string'))
    data = JSON.parse(await dataEntry.async('string'))
  } catch {
    throw new Error('Invalid backup: the archive contents are corrupted')
  }

  if (!manifest || manifest.format !== FORMAT) {
    throw new Error('Unsupported backup format. This file was made by a different version.')
  }
  const username = typeof account.username === 'string' ? account.username : manifest.username
  if (!username) throw new Error('Invalid backup: the account name is missing')
  if (manifest.username && account.username && manifest.username !== account.username) {
    throw new Error('Invalid backup: the account details are inconsistent')
  }

  const normalized = {}
  for (const key of DATA_KEYS) {
    normalized[key] = Array.isArray(data[key]) ? data[key] : []
  }

  const receipts = []
  let totalReceiptBytes = 0
  for (const path of Object.keys(zip.files)) {
    if (!path.startsWith(RECEIPTS_PREFIX) || zip.files[path].dir) continue
    const name = basename(path)
    if (!RECEIPT_FILE_PATTERN.test(name)) continue
    const buffer = await zip.files[path].async('nodebuffer')
    if (buffer.length > MAX_RECEIPT_BYTES) {
      throw new Error('Invalid backup: a receipt exceeds the size limit')
    }
    totalReceiptBytes += buffer.length
    if (totalReceiptBytes > MAX_BACKUP_RECEIPTS_BYTES) {
      throw new Error('Invalid backup: too much receipt data')
    }
    receipts.push({ name, buffer })
  }

  return {
    manifest,
    account: { username, created_at: account.created_at ?? null },
    data: normalized,
    receipts
  }
}

// A backup may only ever be restored into the account it belongs to.
export function assertBackupMatchesAccount(accountUsername, currentUsername) {
  if (!accountUsername || !currentUsername || accountUsername !== currentUsername) {
    throw new Error(
      'This backup belongs to a different account. Sign in with the account that created it to import it.'
    )
  }
}

// Replaces ONLY the given user's rows with the backup contents. Other accounts
// are never read or modified.
export function applyUserBackup(db, userId, payload, receiptsDir, currentUsername) {
  const { account, data, receipts } = payload
  assertBackupMatchesAccount(account.username, currentUsername)
  const includedReceipts = new Set(receipts.map((receipt) => receipt.name))
  const now = new Date().toISOString()

  const oldReceipts = [
    ...db
      .prepare("SELECT receipt_path FROM income WHERE user_id = ? AND receipt_path IS NOT NULL")
      .all(userId),
    ...db
      .prepare("SELECT receipt_path FROM debts WHERE user_id = ? AND receipt_path IS NOT NULL")
      .all(userId),
    ...db
      .prepare(
        `SELECT p.receipt_path FROM debt_payments p
         JOIN debts d ON d.id = p.debt_id
         WHERE d.user_id = ? AND p.receipt_path IS NOT NULL`
      )
      .all(userId)
  ].map((row) => row.receipt_path)

  const run = db.transaction(() => {
    db.prepare(
      'DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE user_id = ?)'
    ).run(userId)
    db.prepare('DELETE FROM debts WHERE user_id = ?').run(userId)
    db.prepare(
      'DELETE FROM savings_contributions WHERE goal_id IN (SELECT id FROM savings_goals WHERE user_id = ?)'
    ).run(userId)
    db.prepare('DELETE FROM savings_goals WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM income WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM expenses WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM budgets WHERE user_id = ?').run(userId)

    const insertIncome = db.prepare(
      `INSERT INTO income (user_id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const incomeMap = new Map()
    for (const row of data.income) {
      const receipt =
        row.receipt_path && includedReceipts.has(row.receipt_path) ? row.receipt_path : null
      const info = insertIncome.run(
        userId,
        num(row.amount),
        row.date,
        row.source ?? null,
        row.notes ?? null,
        receipt,
        row.is_archived ? 1 : 0,
        row.created_at ?? now,
        row.updated_at ?? null
      )
      if (row.id != null) incomeMap.set(row.id, info.lastInsertRowid)
    }

    const insertExpense = db.prepare(
      `INSERT INTO expenses (user_id, category, amount, date, notes, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const row of data.expenses) {
      insertExpense.run(
        userId,
        row.category,
        num(row.amount),
        row.date,
        row.notes ?? null,
        row.is_archived ? 1 : 0,
        row.created_at ?? now,
        row.updated_at ?? null
      )
    }

    const insertDebt = db.prepare(
      `INSERT INTO debts (user_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
                          payment_type, monthly_amount, payment_day, first_payment_date, receipt_path,
                          status, notes, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const debtMap = new Map()
    for (const row of data.debts) {
      const receipt =
        row.receipt_path && includedReceipts.has(row.receipt_path) ? row.receipt_path : null
      const info = insertDebt.run(
        userId,
        row.creditor,
        num(row.total_amount),
        num(row.paid_amount),
        num(row.remaining_amount),
        row.due_date ?? null,
        row.payment_type ?? 'no-schedule',
        row.monthly_amount ?? null,
        row.payment_day ?? null,
        row.first_payment_date ?? null,
        receipt,
        row.status ?? 'unpaid',
        row.notes ?? null,
        row.is_archived ? 1 : 0,
        row.created_at ?? now,
        row.updated_at ?? null
      )
      if (row.id != null) debtMap.set(row.id, info.lastInsertRowid)
    }

    const insertPayment = db.prepare(
      `INSERT INTO debt_payments (debt_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    for (const row of data.debt_payments) {
      const debtId = debtMap.get(row.debt_id)
      if (!debtId) continue
      const receipt =
        row.receipt_path && includedReceipts.has(row.receipt_path) ? row.receipt_path : null
      insertPayment.run(
        debtId,
        num(row.amount),
        row.date,
        row.notes ?? null,
        row.payment_type ?? 'payment',
        row.installment_due ?? null,
        receipt,
        row.created_at ?? now
      )
    }

    const insertBudget = db.prepare(
      `INSERT INTO budgets (user_id, category, monthly_limit, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, category)
       DO UPDATE SET monthly_limit = excluded.monthly_limit,
                     is_archived = excluded.is_archived,
                     updated_at = excluded.updated_at`
    )
    for (const row of data.budgets) {
      insertBudget.run(
        userId,
        row.category,
        num(row.monthly_limit),
        row.is_archived ? 1 : 0,
        row.created_at ?? now,
        row.updated_at ?? null
      )
    }

    const insertGoal = db.prepare(
      `INSERT INTO savings_goals (user_id, goal_name, target_amount, current_amount, deadline, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const goalMap = new Map()
    for (const row of data.savings_goals) {
      const info = insertGoal.run(
        userId,
        row.goal_name,
        num(row.target_amount),
        num(row.current_amount),
        row.deadline ?? null,
        row.is_archived ? 1 : 0,
        row.created_at ?? now,
        row.updated_at ?? null
      )
      if (row.id != null) goalMap.set(row.id, info.lastInsertRowid)
    }

    const insertContribution = db.prepare(
      `INSERT INTO savings_contributions (goal_id, income_id, amount, date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    for (const row of data.savings_contributions) {
      const goalId = goalMap.get(row.goal_id)
      if (!goalId) continue
      const incomeId = row.income_id != null ? incomeMap.get(row.income_id) ?? null : null
      insertContribution.run(
        goalId,
        incomeId,
        num(row.amount),
        row.date,
        row.notes ?? null,
        row.created_at ?? now
      )
    }
  })
  run()

  mkdirSync(receiptsDir, { recursive: true })
  for (const name of oldReceipts) {
    if (!includedReceipts.has(name) && RECEIPT_FILE_PATTERN.test(name)) {
      const full = join(receiptsDir, name)
      if (existsSync(full)) unlinkSync(full)
    }
  }
  for (const receipt of receipts) {
    writeFileSync(join(receiptsDir, receipt.name), receipt.buffer)
  }

  return {
    username: account.username,
    counts: {
      income: data.income.length,
      expenses: data.expenses.length,
      debts: data.debts.length,
      debtPayments: data.debt_payments.length,
      budgets: data.budgets.length,
      savingsGoals: data.savings_goals.length,
      savingsContributions: data.savings_contributions.length,
      receipts: receipts.length
    }
  }
}
