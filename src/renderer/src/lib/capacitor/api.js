import bcrypt from 'bcryptjs'
import JSZip from 'jszip'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import {
  DEBT_PAYMENT_TYPE_VALUES,
  INCOME_SOURCE_MAX_LEN,
  MAX_BACKUP_RECEIPTS_BYTES,
  MAX_RECEIPT_BYTES,
  PAGE_SIZE,
  RECEIPT_EXTENSIONS,
  RECEIPT_FILE_PATTERN
} from '@shared/constants.js'
import { DEFAULT_CURRENCY, isValidCurrency } from '@shared/currency.js'
import { validateBackupData, verifyBackupCounts } from '@shared/backupValidate.js'
import { advanceDue, validateRecurringInput } from '@shared/recurring.js'
import { decryptBackup, encryptBackup, isEncryptedBackup } from '@shared/backupCrypto.js'
import {
  DEFAULT_WALLET,
  computeWalletBalances,
  summarizeWallets,
  validateTransferInput,
  validateWalletId,
  validateWalletInput
} from '@shared/wallets.js'
import { DEFAULT_LEAD_DAYS, MAX_LEAD_DAYS } from '@shared/reminders.js'
import { currentMonth, monthRange, todayISO } from '@shared/dates.js'
import { fromCents, toCents } from '@shared/money.js'
import {
  validateAmount,
  validateCategory,
  validateDate,
  validateId,
  validateInt,
  validatePassword,
  validatePaymentType,
  validateText,
  validateUsername
} from '@shared/validate.js'
import { executeSet, getOne, paginate, query, run, transaction } from './sqlite.js'

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf'
}

const RECEIPTS_DIR = 'receipts'
const BACKUP_FORMAT = 6
const BACKUP_RECEIPTS_PREFIX = 'receipts/'
const INCOME_COLUMNS =
  'id, user_id, wallet_id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at'
const EXPENSE_COLUMNS =
  'id, user_id, wallet_id, category, amount, date, notes, is_archived, created_at, updated_at'
const GOAL_COLUMNS =
  'id, user_id, goal_name, target_amount, current_amount, deadline, wallet_id, kind, is_archived, created_at, updated_at'
const DEBT_COLUMNS = `id, user_id, wallet_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
  payment_type, monthly_amount, payment_day, first_payment_date, receipt_path, status, notes,
  is_archived, created_at, updated_at`
const WALLET_COLUMNS =
  'id, user_id, name, type, style, opening_balance, last4, color, sort_order, is_archived, interest_enabled, interest_rate, interest_crediting, interest_withholding, credit_limit, statement_day, due_day, minimum_payment, apr, track_only, created_at, updated_at'
const WALLET_CARD_COLUMNS = `${WALLET_COLUMNS}, card_image`

let session = null // { id, username } - in-memory, mirrors the main-process session

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `r-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function extname(name) {
  const match = /\.[^.]+$/.exec(String(name || ''))
  return match ? match[0].toLowerCase() : ''
}

function validateMonth(value) {
  const month = String(value ?? currentMonth())
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be in YYYY-MM format')
  const [, m] = month.split('-').map(Number)
  if (m < 1 || m > 12) throw new Error('month must be in YYYY-MM format')
  return month
}

function validateYear(value) {
  const year = String(value ?? new Date().getFullYear())
  if (!/^\d{4}$/.test(year)) throw new Error('year must be a 4-digit year')
  return year
}

function requireUserId() {
  if (!session) throw new Error('Not authenticated')
  return session.id
}

function toBase64(data) {
  let bytes
  if (data instanceof Uint8Array) bytes = data
  else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data)
  else if (Array.isArray(data)) bytes = Uint8Array.from(data)
  else throw new Error('Unsupported export data')
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Could not read the selected file'))
    reader.readAsDataURL(file)
  })
}

async function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read the selected file'))
    reader.readAsArrayBuffer(file)
  })
}

function num(value) {
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function stamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'

    let settled = false
    const finish = (file) => {
      if (settled) return
      settled = true
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('focus', onFocus)
      }
      input.remove()
      resolve(file)
    }
    // When the picker closes without a selection, `change` does not fire. The
    // `cancel` event covers modern WebViews; the window-focus fallback covers
    // the rest so the promise never hangs.
    function onFocus() {
      setTimeout(() => finish(null), 400)
    }
    const supportsCancel = 'oncancel' in input
    input.onchange = () => finish(input.files && input.files[0] ? input.files[0] : null)
    input.oncancel = () => finish(null)
    // Old WebViews may not support the `cancel` event; fall back to window
    // focus so a dismissed picker still resolves instead of hanging.
    if (!supportsCancel && typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('focus', onFocus)
    }
    document.body.appendChild(input)
    input.click()
  })
}

// ---------------------------------------------------------------------------
// Reports helpers (shared with the dashboard period filter semantics)
// ---------------------------------------------------------------------------

function normalizeDashboardPeriod(payload = {}) {
  let mode = payload.mode
  if (!['month', 'range', 'all'].includes(mode)) mode = payload.month ? 'month' : 'all'
  if (mode === 'month') {
    const month = validateMonth(payload.month)
    return { ...monthRange(month), month }
  }
  if (mode === 'range') {
    const from = validateDate(payload.from, 'from')
    const to = validateDate(payload.to, 'to')
    if (from > to) throw new Error('"from" must not be after "to"')
    return { from, to, month: to.slice(0, 7) }
  }
  return { from: '0001-01-01', to: '9999-12-31', month: currentMonth() }
}

async function debtSummary(userId) {
  const row = await getOne(
    `SELECT
       COUNT(*) AS total_debts,
       COALESCE(SUM(remaining_amount), 0) AS outstanding,
       COALESCE(SUM(paid_amount), 0) AS paid,
       SUM(CASE WHEN remaining_amount > 0 AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdue_count
     FROM debts WHERE user_id = ? AND is_archived = 0`,
    [todayISO(), userId]
  )
  return {
    totalDebts: row?.total_debts ?? 0,
    outstanding: fromCents(toCents(row?.outstanding ?? 0)),
    paid: fromCents(toCents(row?.paid ?? 0)),
    overdueCount: row?.overdue_count ?? 0
  }
}

async function budgetListMonthly(userId, month) {
  const { from, to } = monthRange(month)
  const budgets = await query(
    `SELECT id, user_id, category, monthly_limit, is_archived, created_at, updated_at
     FROM budgets WHERE user_id = ? AND is_archived = 0 ORDER BY category ASC`,
    [userId]
  )
  const spentRows = await query(
    'SELECT category, amount FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0',
    [userId, from, to]
  )
  const spentMap = new Map()
  for (const row of spentRows) {
    spentMap.set(row.category, (spentMap.get(row.category) ?? 0) + toCents(row.amount))
  }
  return budgets.map((budget) => {
    const spentCents = spentMap.get(budget.category) ?? 0
    const limitCents = toCents(budget.monthly_limit)
    const percent = limitCents > 0 ? (spentCents / limitCents) * 100 : 0
    return {
      ...budget,
      spent: fromCents(spentCents),
      remaining: fromCents(limitCents - spentCents),
      percent: Math.round(percent),
      over: spentCents > limitCents
    }
  })
}

async function savingsList(userId) {
  const rows = await query(
    `SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE user_id = ? AND is_archived = 0 ORDER BY created_at DESC, id DESC`,
    [userId]
  )
  return rows.map(decorateGoal)
}

function decorateGoal(goal) {
  if (!goal) return null
  const targetCents = toCents(goal.target_amount)
  const currentCents = toCents(goal.current_amount)
  const percent = targetCents > 0 ? (currentCents / targetCents) * 100 : 0
  return {
    ...goal,
    remaining: fromCents(Math.max(0, targetCents - currentCents)),
    percent: Math.round(percent),
    complete: currentCents >= targetCents
  }
}

async function incomesInRange(userId, from, to) {
  return query(
    `SELECT ${INCOME_COLUMNS} FROM income WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0
     ORDER BY date DESC, id DESC LIMIT 5`,
    [userId, from, to]
  )
}

async function expensesInRange(userId, from, to) {
  return query(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0
     ORDER BY date DESC, id DESC LIMIT 5`,
    [userId, from, to]
  )
}

async function getDashboard(userId, payload) {
  const { from, to, month } = normalizeDashboardPeriod(payload)
  const incomeRow = await getOne(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0',
    [userId, from, to]
  )
  const expenseRow = await getOne(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0',
    [userId, from, to]
  )
  const incomeCents = toCents(incomeRow?.total ?? 0)
  const expenseCents = toCents(expenseRow?.total ?? 0)

  const budgets = await budgetListMonthly(userId, month)
  const goals = await savingsList(userId)
  const debts = await debtSummary(userId)
  const savedRow = await getOne(
    'SELECT COALESCE(SUM(current_amount), 0) AS total FROM savings_goals WHERE user_id = ? AND is_archived = 0',
    [userId]
  )

  return {
    month,
    budgetMonth: month,
    from,
    to,
    totalIncome: fromCents(incomeCents),
    totalExpenses: fromCents(expenseCents),
    remaining: fromCents(incomeCents - expenseCents),
    unpaidDebts: debts.outstanding,
    overdueDebts: debts.overdueCount,
    totalSaved: fromCents(toCents(savedRow?.total ?? 0)),
    budgets: {
      count: budgets.length,
      over: budgets.filter((b) => b.over).length,
      items: budgets
    },
    goals: goals.slice(0, 5),
    recentIncome: await incomesInRange(userId, from, to),
    recentExpenses: await expensesInRange(userId, from, to)
  }
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

async function monthlyTotals(userId, period) {
  const isYear = period === null || period === undefined || typeof period !== 'object'
  let from, to
  if (isYear) {
    const year = validateYear(period)
    from = `${year}-01-01`
    to = `${year}-12-31`
  } else {
    from = period.from
    to = period.to
  }

  const incomeRows = await query(
    'SELECT substr(date, 1, 7) AS ym, amount FROM income WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0',
    [userId, from, to]
  )
  const expenseRows = await query(
    'SELECT substr(date, 1, 7) AS ym, amount FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0',
    [userId, from, to]
  )

  const incomeByMonth = new Map()
  for (const row of incomeRows) {
    incomeByMonth.set(row.ym, (incomeByMonth.get(row.ym) ?? 0) + toCents(row.amount))
  }
  const expenseByMonth = new Map()
  for (const row of expenseRows) {
    expenseByMonth.set(row.ym, (expenseByMonth.get(row.ym) ?? 0) + toCents(row.amount))
  }

  let monthKeys
  if (isYear) {
    const year = validateYear(period)
    monthKeys = MONTH_LABELS.map((_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
  } else {
    const withData = [...new Set([...incomeByMonth.keys(), ...expenseByMonth.keys()])].sort()
    if (withData.length === 0) return []
    monthKeys = []
    let [y, m] = withData[0].split('-').map(Number)
    const [endY, endM] = withData[withData.length - 1].split('-').map(Number)
    while (y < endY || (y === endY && m <= endM)) {
      monthKeys.push(`${y}-${String(m).padStart(2, '0')}`)
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
    }
  }

  const multiYear =
    monthKeys.length > 0 &&
    monthKeys[0].slice(0, 4) !== monthKeys[monthKeys.length - 1].slice(0, 4)

  return monthKeys.map((ym) => {
    const [y, m] = ym.split('-').map(Number)
    const label = multiYear ? `${MONTH_LABELS[m - 1]} ${String(y).slice(-2)}` : MONTH_LABELS[m - 1]
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

async function rangeTotals(userId, { from, to }) {
  const incomeRow = await getOne(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM income WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0',
    [userId, from, to]
  )
  const expenseRow = await getOne(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0',
    [userId, from, to]
  )
  const incomeCents = toCents(incomeRow?.total ?? 0)
  const expenseCents = toCents(expenseRow?.total ?? 0)
  return {
    income: fromCents(incomeCents),
    expenses: fromCents(expenseCents),
    net: fromCents(incomeCents - expenseCents)
  }
}

async function categoryBreakdown(userId, { from, to }) {
  const rows = await query(
    `SELECT category, COUNT(*) AS count, SUM(amount) AS total
     FROM expenses WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0
     GROUP BY category ORDER BY total DESC`,
    [userId, from, to]
  )
  return rows.map((row) => ({
    category: row.category,
    count: row.count,
    total: fromCents(toCents(row.total))
  }))
}

async function incomeBySource(userId, { from, to }) {
  const rows = await query(
    `SELECT COALESCE(NULLIF(source, ''), 'Unspecified') AS source, COUNT(*) AS count, SUM(amount) AS total
     FROM income WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0
     GROUP BY source ORDER BY total DESC`,
    [userId, from, to]
  )
  return rows.map((row) => ({
    source: row.source,
    count: row.count,
    total: fromCents(toCents(row.total))
  }))
}

// ---------------------------------------------------------------------------
// Debt helpers
// ---------------------------------------------------------------------------

function effectiveStatus(row, today = todayISO()) {
  if (toCents(row.remaining_amount) <= 0) return 'paid'
  if (row.due_date && row.due_date < today) return 'overdue'
  if (toCents(row.paid_amount) > 0) return 'partial'
  return 'unpaid'
}

function decorateDebt(row) {
  if (!row) return null
  return { ...row, effective_status: effectiveStatus(row) }
}

async function syncDebtStatus(debtId, userId) {
  const debt = await getOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [debtId, userId])
  if (!debt) return null
  const paidRow = await getOne(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM debt_payments WHERE debt_id = ? AND payment_type = 'payment'",
    [debtId]
  )
  const paidAmount = fromCents(toCents(paidRow?.total ?? 0))
  const remaining = fromCents(Math.max(0, toCents(debt.total_amount) - toCents(paidRow?.total ?? 0)))
  const status = effectiveStatus({
    remaining_amount: remaining,
    paid_amount: paidAmount,
    due_date: debt.due_date
  })
  await run(
    `UPDATE debts SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
    [paidAmount, remaining, status, debtId, userId]
  )
}

async function getDebtById(userId, id) {
  return decorateDebt(
    await getOne(`SELECT ${DEBT_COLUMNS} FROM debts WHERE id = ? AND user_id = ?`, [id, userId])
  )
}

function normalizeReceipt(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !RECEIPT_FILE_PATTERN.test(value)) {
    throw new Error('Invalid receipt reference')
  }
  return value
}

async function ensureWallet(userId, value) {
  const id = validateWalletId(value)
  const row = await getOne(
    'SELECT id, user_id, name, type, style, is_archived, track_only FROM wallets WHERE id = ? AND user_id = ?',
    [id, userId]
  )
  if (!row) throw new Error('Wallet not found')
  return row
}

async function ensureActiveWallet(userId, value) {
  const row = await ensureWallet(userId, value)
  if (row.is_archived) throw new Error('Wallet is archived')
  return row
}

// Mirrors the desktop `normalize` in src/main/ipc/debts.ipc.js so both platforms
// validate a debt the same way (first payment date required for monthly, etc.).
function normalizeDebtWrite(data) {
  const paymentType = validatePaymentType(data.payment_type, DEBT_PAYMENT_TYPE_VALUES)
  let dueDate = validateDate(data.due_date, 'due_date', { required: false })
  let monthlyAmount = null
  let paymentDay = null
  let firstPaymentDate = null

  if (paymentType === 'fixed-date' && !dueDate) {
    throw new Error('A due date is required for fixed-date debts')
  }
  if (paymentType === 'monthly') {
    monthlyAmount = validateAmount(data.monthly_amount, 'monthly_amount')
    firstPaymentDate = validateDate(data.first_payment_date, 'first_payment_date', { required: false })
    paymentDay = data.payment_day
      ? validateInt(data.payment_day, 'payment_day', { min: 1, max: 31 })
      : firstPaymentDate
        ? Number(firstPaymentDate.slice(8, 10))
        : null
    if (!firstPaymentDate && !paymentDay) {
      throw new Error('A first payment date is required for monthly debts')
    }
    dueDate = null
  }

  return {
    wallet_id: validateWalletId(data.wallet_id),
    creditor: validateText(data.creditor, 'creditor', { required: true, max: 120 }),
    total_amount: validateAmount(data.total_amount, 'total_amount'),
    due_date: dueDate,
    payment_type: paymentType,
    monthly_amount: monthlyAmount,
    payment_day: paymentDay,
    first_payment_date: firstPaymentDate,
    receipt_path: normalizeReceipt(data.receipt_path),
    notes: validateText(data.notes, 'notes', { max: 500 })
  }
}

// ---------------------------------------------------------------------------
// Public adapter
// ---------------------------------------------------------------------------

export function createCapacitorApi() {
  const auth = {
    register: async (usernameRaw, passwordRaw) => {
      const username = validateUsername(usernameRaw)
      const password = validatePassword(passwordRaw)
      const existing = await getOne('SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1', [
        username
      ])
      if (existing) throw new Error('Username is already taken')
      const hash = bcrypt.hashSync(password, 10)
      const record = await transaction(async () => {
        const info = await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [
          username,
          hash
        ])
        await run(
          'INSERT INTO wallets (user_id, name, type, style, opening_balance, sort_order) VALUES (?, ?, ?, ?, 0, 0)',
          [info.lastId, DEFAULT_WALLET.name, DEFAULT_WALLET.type, DEFAULT_WALLET.style]
        )
        return getOne('SELECT id, username FROM users WHERE id = ?', [info.lastId])
      })
      session = { id: record.id, username: record.username }
      return { user: session }
    },

    login: async (usernameRaw, passwordRaw) => {
      const username = String(usernameRaw ?? '').trim()
      const password = String(passwordRaw ?? '')
      const record = await getOne('SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1', [
        username
      ])
      if (!record || !bcrypt.compareSync(password, record.password_hash)) {
        throw new Error('Invalid username or password')
      }
      session = { id: record.id, username: record.username }
      return { user: session }
    },

    restore: async (userId) => {
      const id = validateId(userId, 'userId')
      const user = await getOne('SELECT id, username FROM users WHERE id = ?', [id])
      if (!user) throw new Error('Saved session user no longer exists')
      // Mirror the desktop gate: a stored id is not enough when the account
      // requires a password on start.
      const settingsRow = await getOne(
        'SELECT require_password_on_start FROM user_settings WHERE user_id = ?',
        [id]
      )
      if (settingsRow && Number(settingsRow.require_password_on_start)) {
        session = null
        const error = new Error('Password required')
        error.code = 'PASSWORD_REQUIRED'
        throw error
      }
      session = { id: user.id, username: user.username }
      return { user: session }
    },

    current: async () => {
      if (!session) return { user: null }
      const user = await getOne('SELECT id, username FROM users WHERE id = ?', [session.id])
      if (!user) {
        session = null
        return { user: null }
      }
      return { user: { id: user.id, username: user.username } }
    },

    logout: async () => {
      session = null
      return true
    },

    changePassword: async (currentPasswordRaw, newPasswordRaw) => {
      const userId = requireUserId()
      const record = await getOne('SELECT * FROM users WHERE id = ?', [userId])
      if (!record) throw new Error('Account not found')
      const currentPassword = String(currentPasswordRaw ?? '')
      if (!bcrypt.compareSync(currentPassword, record.password_hash)) {
        throw new Error('Current password is incorrect')
      }
      const nextPassword = validatePassword(newPasswordRaw, 'newPassword')
      await run('UPDATE users SET password_hash = ? WHERE id = ?', [
        bcrypt.hashSync(nextPassword, 10),
        userId
      ])
      return true
    }
  }

  const settings = {
    get: async () => {
      const userId = requireUserId()
      const row = await getOne(
        'SELECT user_id, currency, require_password_on_start, reminders_enabled, reminder_lead_days, updated_at FROM user_settings WHERE user_id = ?',
        [userId]
      )
      if (!row) {
        return {
          currency: DEFAULT_CURRENCY,
          requirePasswordOnStart: false,
          remindersEnabled: false,
          reminderLeadDays: DEFAULT_LEAD_DAYS
        }
      }
      const lead = Number(row.reminder_lead_days)
      return {
        currency: row.currency || DEFAULT_CURRENCY,
        requirePasswordOnStart: Boolean(row.require_password_on_start),
        remindersEnabled: Boolean(row.reminders_enabled),
        reminderLeadDays: Number.isFinite(lead) ? lead : DEFAULT_LEAD_DAYS
      }
    },
    update: async (patch = {}) => {
      const userId = requireUserId()
      const current = await settings.get()
      if (patch.currency !== undefined && !isValidCurrency(patch.currency)) {
        throw new Error('Unsupported currency')
      }
      const nextCurrency = patch.currency ?? current.currency
      const nextRequire =
        patch.requirePasswordOnStart === undefined
          ? current.requirePasswordOnStart
          : patch.requirePasswordOnStart
      const nextReminders =
        patch.remindersEnabled === undefined ? current.remindersEnabled : patch.remindersEnabled
      const nextLead =
        patch.reminderLeadDays === undefined
          ? current.reminderLeadDays
          : validateInt(patch.reminderLeadDays, 'reminderLeadDays', { min: 0, max: MAX_LEAD_DAYS })
      await run(
        `INSERT INTO user_settings
           (user_id, currency, require_password_on_start, reminders_enabled, reminder_lead_days, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id)
         DO UPDATE SET currency = excluded.currency,
                       require_password_on_start = excluded.require_password_on_start,
                       reminders_enabled = excluded.reminders_enabled,
                       reminder_lead_days = excluded.reminder_lead_days,
                       updated_at = CURRENT_TIMESTAMP`,
        [userId, nextCurrency, nextRequire ? 1 : 0, nextReminders ? 1 : 0, nextLead]
      )
      return settings.get()
    }
  }

  const income = {
    list: async (opts = {}) => {
      const userId = requireUserId()
      const where = ['user_id = ?', 'is_archived = 0']
      const params = [userId]
      if (opts.from) {
        where.push('date >= ?')
        params.push(opts.from)
      }
      if (opts.to) {
        where.push('date <= ?')
        params.push(opts.to)
      }
      if (opts.walletId) {
        where.push('wallet_id = ?')
        params.push(validateWalletId(opts.walletId))
      }
      if (opts.search) {
        where.push("(COALESCE(source, '') LIKE ? OR COALESCE(notes, '') LIKE ?)")
        params.push(`%${opts.search}%`, `%${opts.search}%`)
      }
      const orderBy = opts.order === 'oldest' ? 'date ASC, id ASC' : 'date DESC, id DESC'
      return paginate({
        select: `SELECT ${INCOME_COLUMNS}`,
        from: 'income',
        where,
        params,
        orderBy,
        page: opts.page ?? 1,
        pageSize: opts.pageSize ?? PAGE_SIZE
      })
    },

    get: async (id) => {
      const userId = requireUserId()
      return getOne(`SELECT ${INCOME_COLUMNS} FROM income WHERE id = ? AND user_id = ?`, [
        validateId(id),
        userId
      ])
    },

    all: async (opts = {}) => {
      const userId = requireUserId()
      const where = ['user_id = ?', 'is_archived = 0']
      const params = [userId]
      if (opts.from) {
        where.push('date >= ?')
        params.push(opts.from)
      }
      if (opts.to) {
        where.push('date <= ?')
        params.push(opts.to)
      }
      return query(
        `SELECT ${INCOME_COLUMNS} FROM income WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC`,
        params
      )
    },

    create: async (data) => {
      const userId = requireUserId()
      const wallet = await ensureWallet(userId, data.wallet_id)
      const info = await run(
        `INSERT INTO income (user_id, wallet_id, amount, date, source, notes, receipt_path, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          wallet.id,
          validateAmount(data.amount),
          validateDate(data.date),
          validateText(data.source, 'source', { max: INCOME_SOURCE_MAX_LEN }),
          validateText(data.notes, 'notes'),
          normalizeReceipt(data.receipt_path)
        ]
      )
      return getOne(`SELECT ${INCOME_COLUMNS} FROM income WHERE id = ? AND user_id = ?`, [
        info.lastId,
        userId
      ])
    },

    update: async (id, data) => {
      const userId = requireUserId()
      const wallet = await ensureWallet(userId, data.wallet_id)
      const info = await run(
        `UPDATE income
         SET wallet_id = ?, amount = ?, date = ?, source = ?, notes = ?, receipt_path = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          wallet.id,
          validateAmount(data.amount),
          validateDate(data.date),
          validateText(data.source, 'source', { max: INCOME_SOURCE_MAX_LEN }),
          validateText(data.notes, 'notes'),
          normalizeReceipt(data.receipt_path),
          validateId(id),
          userId
        ]
      )
      if (info.changes === 0) return null
      return getOne(`SELECT ${INCOME_COLUMNS} FROM income WHERE id = ? AND user_id = ?`, [id, userId])
    },

    remove: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE income SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    restore: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE income SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    archived: async () => {
      const userId = requireUserId()
      return query(
        `SELECT ${INCOME_COLUMNS} FROM income WHERE user_id = ? AND is_archived = 1 ORDER BY date DESC, id DESC`,
        [userId]
      )
    }
  }

  const expenses = {
    list: async (opts = {}) => {
      const userId = requireUserId()
      const where = ['user_id = ?', 'is_archived = 0']
      const params = [userId]
      if (opts.category) {
        where.push('category = ?')
        params.push(opts.category)
      }
      if (opts.from) {
        where.push('date >= ?')
        params.push(opts.from)
      }
      if (opts.to) {
        where.push('date <= ?')
        params.push(opts.to)
      }
      if (opts.walletId) {
        where.push('wallet_id = ?')
        params.push(validateWalletId(opts.walletId))
      }
      if (opts.search) {
        where.push("COALESCE(notes, '') LIKE ?")
        params.push(`%${opts.search}%`)
      }
      const orderBy = opts.order === 'oldest' ? 'date ASC, id ASC' : 'date DESC, id DESC'
      return paginate({
        select: `SELECT ${EXPENSE_COLUMNS}`,
        from: 'expenses',
        where,
        params,
        orderBy,
        page: opts.page ?? 1,
        pageSize: opts.pageSize ?? PAGE_SIZE
      })
    },

    get: async (id) => {
      const userId = requireUserId()
      return getOne(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = ? AND user_id = ?`, [
        validateId(id),
        userId
      ])
    },

    create: async (data) => {
      const userId = requireUserId()
      const wallet = await ensureWallet(userId, data.wallet_id)
      const info = await run(
        `INSERT INTO expenses (user_id, wallet_id, category, amount, date, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          wallet.id,
          validateCategory(data.category),
          validateAmount(data.amount),
          validateDate(data.date),
          validateText(data.notes, 'notes')
        ]
      )
      return getOne(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = ? AND user_id = ?`, [
        info.lastId,
        userId
      ])
    },

    update: async (id, data) => {
      const userId = requireUserId()
      const wallet = await ensureWallet(userId, data.wallet_id)
      const info = await run(
        `UPDATE expenses
         SET wallet_id = ?, category = ?, amount = ?, date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          wallet.id,
          validateCategory(data.category),
          validateAmount(data.amount),
          validateDate(data.date),
          validateText(data.notes, 'notes'),
          validateId(id),
          userId
        ]
      )
      if (info.changes === 0) return null
      return getOne(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = ? AND user_id = ?`, [
        id,
        userId
      ])
    },

    remove: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE expenses SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    restore: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE expenses SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    archived: async () => {
      const userId = requireUserId()
      return query(
        `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE user_id = ? AND is_archived = 1 ORDER BY date DESC, id DESC`,
        [userId]
      )
    },

    categories: async () => {
      const userId = requireUserId()
      const rows = await query(
        'SELECT DISTINCT category FROM expenses WHERE user_id = ? AND is_archived = 0 ORDER BY category ASC',
        [userId]
      )
      return rows.map((row) => row.category)
    }
  }

  const debts = {
    list: async (opts = {}) => {
      const userId = requireUserId()
      const today = todayISO()
      const where = ['user_id = ?', 'is_archived = 0']
      const params = [userId]
      if (opts.search) {
        where.push("(COALESCE(creditor, '') LIKE ? OR COALESCE(notes, '') LIKE ?)")
        params.push(`%${opts.search}%`, `%${opts.search}%`)
      }
      if (opts.status) {
        if (opts.status === 'paid') where.push('remaining_amount <= 0')
        else if (opts.status === 'overdue') {
          where.push('remaining_amount > 0 AND due_date IS NOT NULL AND due_date < ?')
          params.push(today)
        } else if (opts.status === 'partial') where.push('remaining_amount > 0 AND paid_amount > 0')
        else if (opts.status === 'unpaid') where.push('remaining_amount > 0 AND paid_amount <= 0')
      }
      const orderBy =
        opts.order === 'due'
          ? 'due_date IS NULL, due_date ASC, id DESC'
          : opts.order === 'oldest'
            ? 'created_at ASC, id ASC'
            : 'created_at DESC, id DESC'
      const result = await paginate({
        select: `SELECT ${DEBT_COLUMNS}`,
        from: 'debts',
        where,
        params,
        orderBy,
        page: opts.page ?? 1,
        pageSize: opts.pageSize ?? PAGE_SIZE
      })
      result.rows = result.rows.map((row) => decorateDebt(row))
      return result
    },

    get: async (id) => {
      const userId = requireUserId()
      return getDebtById(userId, validateId(id))
    },

    create: async (data) => {
      const userId = requireUserId()
      const row = normalizeDebtWrite(data)
      const wallet = await ensureWallet(userId, row.wallet_id)
      const remaining = fromCents(toCents(row.total_amount))
      const info = await run(
        `INSERT INTO debts
          (user_id, wallet_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
           payment_type, monthly_amount, payment_day, first_payment_date, receipt_path, status, notes, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          wallet.id,
          row.creditor,
          row.total_amount,
          remaining,
          row.due_date,
          row.payment_type,
          row.monthly_amount,
          row.payment_day,
          row.first_payment_date,
          row.receipt_path,
          row.notes
        ]
      )
      return getDebtById(userId, info.lastId)
    },

    update: async (id, data) => {
      const userId = requireUserId()
      const current = await getOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [
        validateId(id),
        userId
      ])
      if (!current) return null
      const row = normalizeDebtWrite(data)
      const wallet = await ensureWallet(userId, row.wallet_id)
      const paid = toCents(current.paid_amount)
      const remaining = fromCents(Math.max(0, toCents(row.total_amount) - paid))
      const info = await run(
        `UPDATE debts
         SET wallet_id = ?, creditor = ?, total_amount = ?, remaining_amount = ?, due_date = ?,
             payment_type = ?, monthly_amount = ?, payment_day = ?, first_payment_date = ?,
             receipt_path = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          wallet.id,
          row.creditor,
          row.total_amount,
          remaining,
          row.due_date,
          row.payment_type,
          row.monthly_amount,
          row.payment_day,
          row.first_payment_date,
          row.receipt_path,
          row.notes,
          id,
          userId
        ]
      )
      if (info.changes === 0) return null
      await syncDebtStatus(id, userId)
      return getDebtById(userId, id)
    },

    remove: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE debts SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    restore: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE debts SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    archived: async () => {
      const userId = requireUserId()
      const rows = await query(
        `SELECT ${DEBT_COLUMNS} FROM debts WHERE user_id = ? AND is_archived = 1 ORDER BY created_at DESC, id DESC`,
        [userId]
      )
      return rows.map((row) => decorateDebt(row))
    },

    payments: async (debtId) => {
      const userId = requireUserId()
      const id = validateId(debtId, 'debtId')
      const debt = await getOne('SELECT id FROM debts WHERE id = ? AND user_id = ?', [id, userId])
      if (!debt) return null
      return query(
        `SELECT id, debt_id, wallet_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at
         FROM debt_payments WHERE debt_id = ? ORDER BY date DESC, id DESC`,
        [id]
      )
    },

    addPayment: async (debtId, data) => {
      const userId = requireUserId()
      const id = validateId(debtId, 'debtId')
      const debt = await getOne('SELECT id FROM debts WHERE id = ? AND user_id = ?', [id, userId])
      if (!debt) return null
      const wallet = await ensureWallet(userId, data.wallet_id)
      const amount = validateAmount(data.amount)
      const date = validateDate(data.date)
      const notes = validateText(data.notes, 'notes')
      const installmentDue = data.installment_due
        ? validateDate(data.installment_due, 'installment_due')
        : null
      await run(
        `INSERT INTO debt_payments (debt_id, wallet_id, amount, date, notes, payment_type, installment_due, receipt_path)
         VALUES (?, ?, ?, ?, ?, 'payment', ?, ?)`,
        [id, wallet.id, amount, date, notes, installmentDue, normalizeReceipt(data.receipt_path)]
      )
      await syncDebtStatus(id, userId)
      return getDebtById(userId, id)
    },

    removePayment: async (paymentId) => {
      const userId = requireUserId()
      const id = validateId(paymentId, 'paymentId')
      const payment = await getOne(
        `SELECT p.* FROM debt_payments p
         JOIN debts d ON d.id = p.debt_id
         WHERE p.id = ? AND d.user_id = ?`,
        [id, userId]
      )
      if (!payment) return null
      await run('DELETE FROM debt_payments WHERE id = ?', [id])
      await syncDebtStatus(payment.debt_id, userId)
      return getDebtById(userId, payment.debt_id)
    }
  }

  async function ensureUniqueWallet(userId, name, type, excludeId = 0) {
    const duplicate = await getOne(
      `SELECT id FROM wallets
       WHERE user_id = ? AND type = ? AND lower(trim(name)) = lower(trim(?)) AND id <> ?
       LIMIT 1`,
      [userId, type, name, excludeId]
    )
    if (duplicate) throw new Error('A wallet with this name and type already exists')
  }

  const wallets = {
    list: async () => {
      const userId = requireUserId()
      return query(
        `SELECT ${WALLET_COLUMNS} FROM wallets
         WHERE user_id = ? AND is_archived = 0 ORDER BY sort_order ASC, id ASC`,
        [userId]
      )
    },

    get: async (id) => {
      const userId = requireUserId()
      return getOne(`SELECT ${WALLET_CARD_COLUMNS} FROM wallets WHERE id = ? AND user_id = ?`, [
        validateId(id),
        userId
      ])
    },

    create: async (data) => {
      const userId = requireUserId()
      const row = validateWalletInput(data)
      await ensureUniqueWallet(userId, row.name, row.type)
      const next = await getOne(
        'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM wallets WHERE user_id = ?',
        [userId]
      )
      const info = await run(
        `INSERT INTO wallets
          (user_id, name, type, style, opening_balance, last4, color, card_image, sort_order,
           interest_enabled, interest_rate, interest_crediting, interest_withholding, credit_limit, statement_day, due_day, minimum_payment, apr, track_only, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          row.name,
          row.type,
          row.style,
          row.opening_balance,
          row.last4,
          row.color,
          row.card_image,
          next?.next ?? 0,
          row.interest_enabled,
          row.interest_rate,
          row.interest_crediting,
          row.interest_withholding,
          row.credit_limit,
          row.statement_day,
          row.due_day,
          row.minimum_payment,
          row.apr,
          row.track_only
        ]
      )
      return getOne(`SELECT ${WALLET_CARD_COLUMNS} FROM wallets WHERE id = ? AND user_id = ?`, [
        info.lastId,
        userId
      ])
    },

    update: async (id, data) => {
      const userId = requireUserId()
      const current = await getOne('SELECT id FROM wallets WHERE id = ? AND user_id = ?', [
        validateId(id),
        userId
      ])
      if (!current) return null
      const row = validateWalletInput(data)
      const cash = await getOne(
        "SELECT id FROM wallets WHERE user_id = ? AND type = 'cash' ORDER BY sort_order ASC, id ASC LIMIT 1",
        [userId]
      )
      if (cash?.id === Number(id) && row.type !== 'cash') {
        throw new Error('The default Cash wallet must stay a cash wallet')
      }
      await ensureUniqueWallet(userId, row.name, row.type, Number(id))
      await run(
        `UPDATE wallets
         SET name = ?, type = ?, style = ?, opening_balance = ?, last4 = ?, color = ?, card_image = ?,
             interest_enabled = ?, interest_rate = ?, interest_crediting = ?, interest_withholding = ?,
             credit_limit = ?, statement_day = ?, due_day = ?, minimum_payment = ?, apr = ?, track_only = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          row.name,
          row.type,
          row.style,
          row.opening_balance,
          row.last4,
          row.color,
          row.card_image,
          row.interest_enabled,
          row.interest_rate,
          row.interest_crediting,
          row.interest_withholding,
          row.credit_limit,
          row.statement_day,
          row.due_day,
          row.minimum_payment,
          row.apr,
          row.track_only,
          id,
          userId
        ]
      )
      return getOne(`SELECT ${WALLET_CARD_COLUMNS} FROM wallets WHERE id = ? AND user_id = ?`, [
        id,
        userId
      ])
    },

    remove: async (id) => {
      const userId = requireUserId()
      const walletId = validateId(id)
      const cash = await getOne(
        "SELECT id FROM wallets WHERE user_id = ? AND type = 'cash' ORDER BY sort_order ASC, id ASC LIMIT 1",
        [userId]
      )
      if (cash?.id === walletId) throw new Error('The default Cash wallet cannot be archived')
      const active = await getOne(
        'SELECT COUNT(*) AS count FROM wallets WHERE user_id = ? AND is_archived = 0',
        [userId]
      )
      if ((active?.count ?? 0) <= 1) throw new Error('At least one wallet must stay active')
      const info = await run(
        'UPDATE wallets SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0',
        [walletId, userId]
      )
      return info.changes > 0
    },

    restore: async (id) => {
      const userId = requireUserId()
      const walletId = validateId(id)
      const archived = await getOne(
        'SELECT name, type FROM wallets WHERE id = ? AND user_id = ? AND is_archived = 1',
        [walletId, userId]
      )
      if (!archived) return false
      await ensureUniqueWallet(userId, archived.name, archived.type, walletId)
      const info = await run(
        'UPDATE wallets SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1',
        [walletId, userId]
      )
      return info.changes > 0
    },

    archived: async () => {
      const userId = requireUserId()
      return query(
        `SELECT ${WALLET_COLUMNS} FROM wallets
         WHERE user_id = ? AND is_archived = 1 ORDER BY sort_order ASC, id ASC`,
        [userId]
      )
    },

    move: async (id, direction) => {
      const userId = requireUserId()
      if (direction !== 'up' && direction !== 'down') throw new Error('direction must be up or down')
      const walletId = validateId(id)
      const rows = await query(
        `SELECT id, sort_order FROM wallets
         WHERE user_id = ? AND is_archived = 0 ORDER BY sort_order ASC, id ASC`,
        [userId]
      )
      const index = rows.findIndex((row) => row.id === walletId)
      const target = direction === 'up' ? index - 1 : index + 1
      if (index === -1 || target < 0 || target >= rows.length) return { moved: false }
      const ordered = rows.map((row) => row.id)
      ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
      await transaction(async () => {
        for (let position = 0; position < ordered.length; position += 1) {
          await run('UPDATE wallets SET sort_order = ? WHERE id = ?', [position, ordered[position]])
        }
      })
      return { moved: true }
    },

    summary: async () => {
      const userId = requireUserId()
      const [rows, income, expenses, debts, payments, transfers, debt] = await Promise.all([
        query(
          `SELECT ${WALLET_CARD_COLUMNS} FROM wallets
           WHERE user_id = ? AND is_archived = 0 ORDER BY sort_order ASC, id ASC`,
          [userId]
        ),
        query('SELECT amount, wallet_id FROM income WHERE user_id = ? AND is_archived = 0', [
          userId
        ]),
        query('SELECT amount, wallet_id FROM expenses WHERE user_id = ? AND is_archived = 0', [
          userId
        ]),
        query(
          'SELECT total_amount, wallet_id FROM debts WHERE user_id = ? AND is_archived = 0 AND wallet_id IS NOT NULL',
          [userId]
        ),
        query(
          `SELECT p.amount, p.wallet_id FROM debt_payments p
           JOIN debts d ON d.id = p.debt_id
           WHERE d.user_id = ? AND d.is_archived = 0 AND p.wallet_id IS NOT NULL`,
          [userId]
        ),
        query(
          'SELECT amount, from_wallet_id, to_wallet_id FROM wallet_transfers WHERE user_id = ? AND is_archived = 0',
          [userId]
        ),
        debtSummary(userId)
      ])
      const balances = computeWalletBalances({
        wallets: rows,
        income,
        expenses,
        debts,
        payments,
        transfers
      })
      return {
        wallets: balances.wallets,
        total: balances.total,
        ...summarizeWallets(balances.wallets, toCents(debt.outstanding))
      }
    },

    activity: async (walletId, limit = 100) => {
      const userId = requireUserId()
      const id = validateWalletId(walletId)
      const capped = Math.min(500, Math.max(1, Number(limit) || 100))
      return query(
        `SELECT * FROM (
          SELECT 'income' AS kind, id, date AS date, amount AS amount, COALESCE(source, '') AS label,
                 notes, NULL AS from_name, NULL AS to_name
          FROM income WHERE user_id = ? AND wallet_id = ? AND is_archived = 0
          UNION ALL
          SELECT 'expense', id, date, -amount, category, notes, NULL, NULL
          FROM expenses WHERE user_id = ? AND wallet_id = ? AND is_archived = 0
          UNION ALL
          SELECT 'loan', d.id, COALESCE(substr(d.created_at, 1, 10), d.due_date, ''), d.total_amount,
                 d.creditor, d.notes, NULL, NULL
          FROM debts d WHERE d.user_id = ? AND d.wallet_id = ? AND d.is_archived = 0
          UNION ALL
          SELECT 'payment', p.id, p.date, -p.amount, 'Debt payment', p.notes, NULL, NULL
          FROM debt_payments p JOIN debts d ON d.id = p.debt_id
          WHERE d.user_id = ? AND p.wallet_id = ? AND d.is_archived = 0
          UNION ALL
          SELECT 'transfer', t.id, t.date, -t.amount, 'Transfer out', t.notes, fw.name, tw.name
          FROM wallet_transfers t
          JOIN wallets fw ON fw.id = t.from_wallet_id
          JOIN wallets tw ON tw.id = t.to_wallet_id
          WHERE t.user_id = ? AND t.from_wallet_id = ? AND t.is_archived = 0
          UNION ALL
          SELECT 'transfer', t.id, t.date, t.amount, 'Transfer in', t.notes, fw.name, tw.name
          FROM wallet_transfers t
          JOIN wallets fw ON fw.id = t.from_wallet_id
          JOIN wallets tw ON tw.id = t.to_wallet_id
          WHERE t.user_id = ? AND t.to_wallet_id = ? AND t.is_archived = 0
        )
        ORDER BY date DESC, id DESC
        LIMIT ?`,
        [
          userId,
          id,
          userId,
          id,
          userId,
          id,
          userId,
          id,
          userId,
          id,
          userId,
          id,
          capped
        ]
      )
    },

    transfer: async (data) => {
      const userId = requireUserId()
      const row = validateTransferInput(data)
      const from = await ensureActiveWallet(userId, row.from_wallet_id)
      const to = await ensureActiveWallet(userId, row.to_wallet_id)
      if (from.track_only || to.track_only) {
        throw new Error('Transfers are not available for track-only wallets')
      }
      const info = await run(
        `INSERT INTO wallet_transfers
          (user_id, from_wallet_id, to_wallet_id, amount, date, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, from.id, to.id, row.amount, row.date, row.notes]
      )
      return getTransfer(userId, info.lastId)
    },

    removeTransfer: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE wallet_transfers SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    restoreTransfer: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE wallet_transfers SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    archivedTransfers: async () => {
      const userId = requireUserId()
      return query(
        `SELECT t.*, fw.name AS from_name, tw.name AS to_name
         FROM wallet_transfers t
         JOIN wallets fw ON fw.id = t.from_wallet_id
         JOIN wallets tw ON tw.id = t.to_wallet_id
         WHERE t.user_id = ? AND t.is_archived = 1
         ORDER BY t.date DESC, t.id DESC`,
        [userId]
      )
    }
  }

  async function getTransfer(userId, id) {
    return getOne(
      `SELECT t.*, fw.name AS from_name, tw.name AS to_name
       FROM wallet_transfers t
       JOIN wallets fw ON fw.id = t.from_wallet_id
       JOIN wallets tw ON tw.id = t.to_wallet_id
       WHERE t.id = ? AND t.user_id = ?`,
      [id, userId]
    )
  }

  const budgets = {
    list: async (month) => {
      const userId = requireUserId()
      return budgetListMonthly(userId, validateMonth(month))
    },

    upsert: async (data) => {
      const userId = requireUserId()
      const category = validateCategory(data.category)
      const limit = validateAmount(data.monthly_limit, 'monthly_limit')
      await run(
        `INSERT INTO budgets (user_id, category, monthly_limit, is_archived, updated_at)
         VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, category)
         DO UPDATE SET monthly_limit = excluded.monthly_limit,
                       is_archived = 0,
                       updated_at = CURRENT_TIMESTAMP`,
        [userId, category, limit]
      )
      return getOne(
        'SELECT id, user_id, category, monthly_limit, is_archived, created_at, updated_at FROM budgets WHERE user_id = ? AND category = ?',
        [userId, category]
      )
    },

    remove: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE budgets SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    restore: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE budgets SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    archived: async () => {
      const userId = requireUserId()
      return query(
        `SELECT id, user_id, category, monthly_limit, is_archived, created_at, updated_at
         FROM budgets WHERE user_id = ? AND is_archived = 1 ORDER BY category ASC`,
        [userId]
      )
    }
  }

  const savings = {
    list: async () => {
      const userId = requireUserId()
      return savingsList(userId)
    },

    get: async (id) => {
      const userId = requireUserId()
      return decorateGoal(
        await getOne(`SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE id = ? AND user_id = ?`, [
          validateId(id),
          userId
        ])
      )
    },

    create: async (data) => {
      const userId = requireUserId()
      const info = await run(
        `INSERT INTO savings_goals (user_id, goal_name, target_amount, current_amount, deadline, wallet_id, kind, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          validateText(data.goal_name, 'goal_name', { required: true, max: 120 }),
          validateAmount(data.target_amount, 'target_amount'),
          validateDate(data.deadline, 'deadline', { required: false }),
          data.wallet_id ? validateId(data.wallet_id, 'wallet_id') : null,
          data.kind === 'sinking' ? 'sinking' : 'goal'
        ]
      )
      return decorateGoal(
        await getOne(`SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE id = ? AND user_id = ?`, [
          info.lastId,
          userId
        ])
      )
    },

    update: async (id, data) => {
      const userId = requireUserId()
      const info = await run(
        `UPDATE savings_goals
         SET goal_name = ?, target_amount = ?, deadline = ?, wallet_id = ?, kind = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          validateText(data.goal_name, 'goal_name', { required: true, max: 120 }),
          validateAmount(data.target_amount, 'target_amount'),
          validateDate(data.deadline, 'deadline', { required: false }),
          data.wallet_id ? validateId(data.wallet_id, 'wallet_id') : null,
          data.kind === 'sinking' ? 'sinking' : 'goal',
          validateId(id),
          userId
        ]
      )
      if (info.changes === 0) return null
      return decorateGoal(
        await getOne(`SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE id = ? AND user_id = ?`, [
          id,
          userId
        ])
      )
    },

    remove: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE savings_goals SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    restore: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE savings_goals SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1',
        [validateId(id), userId]
      )
      return info.changes > 0
    },

    archived: async () => {
      const userId = requireUserId()
      const rows = await query(
        `SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE user_id = ? AND is_archived = 1 ORDER BY created_at DESC, id DESC`,
        [userId]
      )
      return rows.map(decorateGoal)
    },

    contributions: async (goalId) => {
      const userId = requireUserId()
      const id = validateId(goalId, 'goalId')
      const goal = await getOne('SELECT id FROM savings_goals WHERE id = ? AND user_id = ?', [
        id,
        userId
      ])
      if (!goal) return null
      return query(
        `SELECT c.id, c.goal_id, c.income_id, c.amount, c.date, c.notes, c.created_at,
                i.source AS income_source
         FROM savings_contributions c
         LEFT JOIN income i ON i.id = c.income_id AND i.user_id = ?
         WHERE c.goal_id = ? ORDER BY c.date DESC, c.id DESC`,
        [userId, id]
      )
    },

    addContribution: async (goalId, data) => {
      const userId = requireUserId()
      const id = validateId(goalId, 'goalId')
      const goal = await getOne('SELECT id FROM savings_goals WHERE id = ? AND user_id = ?', [
        id,
        userId
      ])
      if (!goal) return null
      let incomeId = null
      if (data.income_id) {
        const income = await getOne('SELECT id FROM income WHERE id = ? AND user_id = ?', [
          validateId(data.income_id, 'income_id'),
          userId
        ])
        if (!income) throw new Error('Linked income not found')
        incomeId = income.id
      }
      await run(
        `INSERT INTO savings_contributions (goal_id, income_id, amount, date, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          incomeId,
          validateAmount(data.amount),
          validateDate(data.date),
          validateText(data.notes, 'notes')
        ]
      )
      await syncGoalAmount(id, userId)
      return decorateGoal(
        await getOne(`SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE id = ? AND user_id = ?`, [
          id,
          userId
        ])
      )
    },

    removeContribution: async (contributionId) => {
      const userId = requireUserId()
      const id = validateId(contributionId, 'contributionId')
      const row = await getOne(
        `SELECT c.* FROM savings_contributions c
         JOIN savings_goals g ON g.id = c.goal_id
         WHERE c.id = ? AND g.user_id = ?`,
        [id, userId]
      )
      if (!row) return null
      await run('DELETE FROM savings_contributions WHERE id = ?', [id])
      await syncGoalAmount(row.goal_id, userId)
      return decorateGoal(
        await getOne(`SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE id = ? AND user_id = ?`, [
          row.goal_id,
          userId
        ])
      )
    }
  }

  async function syncGoalAmount(goalId, userId) {
    const row = await getOne(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM savings_contributions WHERE goal_id = ?',
      [goalId]
    )
    await run(
      'UPDATE savings_goals SET current_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [fromCents(toCents(row?.total ?? 0)), goalId, userId]
    )
  }

  const reports = {
    dashboard: async (payload) => getDashboard(requireUserId(), payload),
    monthlyTotals: async (period) => monthlyTotals(requireUserId(), period),
    rangeTotals: async (params) => {
      const userId = requireUserId()
      return rangeTotals(userId, {
        from: validateDate(params.from, 'from'),
        to: validateDate(params.to, 'to')
      })
    },
    categoryBreakdown: async (params) => {
      const userId = requireUserId()
      return categoryBreakdown(userId, {
        from: validateDate(params.from, 'from'),
        to: validateDate(params.to, 'to')
      })
    },
    incomeBySource: async (params) => {
      const userId = requireUserId()
      return incomeBySource(userId, {
        from: validateDate(params.from, 'from'),
        to: validateDate(params.to, 'to')
      })
    },
    debtSummary: async () => debtSummary(requireUserId())
  }

  const files = {
    selectReceipt: async () => {
      const file = await pickFile(RECEIPT_EXTENSIONS.join(','))
      if (!file) return null
      const ext = extname(file.name)
      if (!RECEIPT_EXTENSIONS.includes(ext)) throw new Error('Unsupported receipt file type')
      if (file.size > MAX_RECEIPT_BYTES) throw new Error('Receipt exceeds the 10 MB limit')
      const base64 = await readAsBase64(file)
      const filename = `${uuid()}${ext}`
      await Filesystem.writeFile({
        path: `${RECEIPTS_DIR}/${filename}`,
        data: base64,
        directory: Directory.Data,
        recursive: true
      })
      return filename
    },

    readReceipt: async (filename) => {
      if (typeof filename !== 'string' || filename.includes('/') || filename.includes('..')) {
        throw new Error('Invalid receipt reference')
      }
      const result = await Filesystem.readFile({
        path: `${RECEIPTS_DIR}/${filename}`,
        directory: Directory.Data
      }).catch(() => null)
      if (!result) throw new Error('Receipt not found')
      const mime = MIME_BY_EXT[extname(filename)] ?? 'application/octet-stream'
      return {
        filename,
        name: filename,
        mime,
        dataUrl: `data:${mime};base64,${result.data}`
      }
    },

    openReceipt: async () => {
      throw new Error('Opening receipts in a system viewer is not supported on mobile')
    },

    deleteReceipt: async (filename) => {
      if (typeof filename !== 'string' || filename.includes('/') || filename.includes('..')) {
        throw new Error('Invalid receipt reference')
      }
      await Filesystem.deleteFile({
        path: `${RECEIPTS_DIR}/${filename}`,
        directory: Directory.Data
      }).catch(() => {})
      return true
    },

    saveExport: async ({ defaultName, data, mimeType } = {}) => {
      const name = String(defaultName ?? 'export').replace(/[\\/]/g, '_')
      const base64 = toBase64(data)
      const written = await Filesystem.writeFile({
        path: name,
        data: base64,
        directory: Directory.Cache,
        recursive: true
      })
      // Hand the file to the Android share sheet (Files, Drive, email, ...);
      // app-private storage alone would make the export invisible to the user.
      await Share.share({
        title: name,
        url: written.uri,
        dialogTitle: 'Save or share your export'
      }).catch(() => {})
      return { saved: true, path: written.uri, mimeType }
    }
  }

  const backup = {
    // Same ZIP layout as the desktop build (manifest + account + data +
    // receipts/), so a backup can be moved between desktop and Android.
    export: async (passphrase) => {
      if (typeof passphrase !== 'string' || passphrase.length === 0) {
        throw new Error('A backup password is required')
      }
      const userId = requireUserId()
      const user = await getOne('SELECT id, username, created_at FROM users WHERE id = ?', [userId])
      if (!user) throw new Error('Account not found')

      const income = await query(
        `SELECT id, wallet_id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at
         FROM income WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const expenses = await query(
        `SELECT wallet_id, category, amount, date, notes, is_archived, created_at, updated_at
         FROM expenses WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const debts = await query(
        `SELECT id, wallet_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
                payment_type, monthly_amount, payment_day, first_payment_date, receipt_path,
                status, notes, is_archived, created_at, updated_at
         FROM debts WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const debtIds = debts.map((row) => row.id)
      const debtPayments = debtIds.length
        ? await query(
            `SELECT debt_id, wallet_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at
             FROM debt_payments WHERE debt_id IN (${debtIds.map(() => '?').join(',')}) ORDER BY id`,
            debtIds
          )
        : []
      const budgets = await query(
        `SELECT category, monthly_limit, is_archived, created_at, updated_at
         FROM budgets WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const savingsGoals = await query(
        `SELECT id, goal_name, target_amount, current_amount, deadline, wallet_id, kind, is_archived, created_at, updated_at
         FROM savings_goals WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const goalIds = savingsGoals.map((row) => row.id)
      const savingsContributions = goalIds.length
        ? await query(
            `SELECT goal_id, income_id, amount, date, notes, created_at
             FROM savings_contributions WHERE goal_id IN (${goalIds.map(() => '?').join(',')}) ORDER BY id`,
            goalIds
          )
        : []
      const walletRows = await query(
        `SELECT id, name, type, style, opening_balance, last4, color, card_image, sort_order,
                is_archived, interest_enabled, interest_rate, interest_crediting, interest_withholding,
                credit_limit, statement_day, due_day, minimum_payment, apr, track_only,
                created_at, updated_at
         FROM wallets WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const transferRows = await query(
        `SELECT id, from_wallet_id, to_wallet_id, amount, date, notes, is_archived, created_at, updated_at
         FROM wallet_transfers WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const recurringRules = await query(
        `SELECT id, name, kind, wallet_id, category, amount, frequency, next_due, reminder_days, is_archived, created_at, updated_at
         FROM recurring_rules WHERE user_id = ? ORDER BY id`,
        [userId]
      )

      const counts = {
        income: income.length,
        expenses: expenses.length,
        debts: debts.length,
        debtPayments: debtPayments.length,
        budgets: budgets.length,
        savingsGoals: savingsGoals.length,
        savingsContributions: savingsContributions.length,
        wallets: walletRows.length,
        walletTransfers: transferRows.length,
        recurringRules: recurringRules.length,
        receipts: 0
      }

      const zip = new JSZip()
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
            debt_payments: debtPayments,
            budgets,
            savings_goals: savingsGoals,
            savings_contributions: savingsContributions,
            wallets: walletRows,
            wallet_transfers: transferRows,
            recurring_rules: recurringRules
          },
          null,
          2
        )
      )

      const folder = zip.folder('receipts')
      const seen = new Set()
      const refs = [
        ...income.map((row) => row.receipt_path),
        ...debts.map((row) => row.receipt_path),
        ...debtPayments.map((row) => row.receipt_path)
      ]
      for (const name of refs) {
        if (!name || seen.has(name) || !RECEIPT_FILE_PATTERN.test(name)) continue
        seen.add(name)
        const file = await Filesystem.readFile({
          path: `${RECEIPTS_DIR}/${name}`,
          directory: Directory.Data
        }).catch(() => null)
        if (!file?.data) continue
        folder.file(name, file.data, { base64: true })
        counts.receipts += 1
      }

      zip.file(
        'manifest.json',
        JSON.stringify(
          {
            app: 'PocketVault',
            format: BACKUP_FORMAT,
            username: user.username,
            createdAt: new Date().toISOString(),
            counts
          },
          null,
          2
        )
      )

      const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
      const encrypted = await encryptBackup(bytes, passphrase)
      const name = `pocketvault-${user.username}-backup-${stamp()}.pvbak`
      const written = await Filesystem.writeFile({
        path: name,
        data: toBase64(new TextEncoder().encode(encrypted)),
        directory: Directory.Cache,
        recursive: true
      })

      // Hand the file to the Android share sheet so it can be saved to Files,
      // Drive, or sent anywhere (no storage permission required). Cancelling
      // the share sheet is not an export failure: the encrypted file is already
      // written to the app cache.
      await Share.share({
        title: 'PocketVault encrypted backup',
        text: `Encrypted PocketVault backup for ${user.username}`,
        url: written.uri,
        dialogTitle: 'Save or share your encrypted backup'
      }).catch(() => {})

      return { saved: true, path: written.uri, counts, encrypted: true }
    },

    import: async (passphrase) => {
      const userId = requireUserId()
      const user = await getOne('SELECT id, username FROM users WHERE id = ?', [userId])
      if (!user) throw new Error('Account not found')

      const file = await pickFile('.pvbak,.zip,application/zip,application/octet-stream')
      if (!file) return { imported: false }

      const raw = await readAsArrayBuffer(file)
      let buffer = raw
      if (isEncryptedBackup(raw)) {
        buffer = await decryptBackup(raw, passphrase ?? '')
      }
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

      if (!manifest || ![2, 3, 4, 5, 6].includes(manifest.format)) {
        throw new Error('Unsupported backup format. This file was made by a different version.')
      }
      const username = typeof account.username === 'string' ? account.username : manifest.username
      if (!username) throw new Error('Invalid backup: the account name is missing')
      if (username !== user.username) {
        throw new Error(
          'This backup belongs to a different account. Sign in with the account that created it to import it.'
        )
      }

      const receipts = []
      let totalReceiptBytes = 0
      for (const path of Object.keys(zip.files)) {
        if (!path.startsWith(BACKUP_RECEIPTS_PREFIX) || zip.files[path].dir) continue
        const name = path.slice(BACKUP_RECEIPTS_PREFIX.length)
        if (name.includes('/') || !RECEIPT_FILE_PATTERN.test(name)) continue
        const base64 = await zip.files[path].async('base64')
        const approxBytes = Math.floor((base64.length * 3) / 4)
        if (approxBytes > MAX_RECEIPT_BYTES) {
          throw new Error('Invalid backup: a receipt exceeds the size limit')
        }
        totalReceiptBytes += approxBytes
        if (totalReceiptBytes > MAX_BACKUP_RECEIPTS_BYTES) {
          throw new Error('Invalid backup: too much receipt data')
        }
        receipts.push({ name, base64 })
      }
      const included = new Set(receipts.map((receipt) => receipt.name))

      // Reject malformed rows and truncated/tampered archives before we touch
      // the database, and make the whole replace atomic so a mid-import failure
      // rolls back instead of wiping the account.
      validateBackupData({
        income: Array.isArray(data.income) ? data.income : [],
        expenses: Array.isArray(data.expenses) ? data.expenses : [],
        debts: Array.isArray(data.debts) ? data.debts : [],
        debt_payments: Array.isArray(data.debt_payments) ? data.debt_payments : [],
        budgets: Array.isArray(data.budgets) ? data.budgets : [],
        savings_goals: Array.isArray(data.savings_goals) ? data.savings_goals : [],
        savings_contributions: Array.isArray(data.savings_contributions) ? data.savings_contributions : [],
        wallets: Array.isArray(data.wallets) ? data.wallets : [],
        wallet_transfers: Array.isArray(data.wallet_transfers) ? data.wallet_transfers : [],
        recurring_rules: Array.isArray(data.recurring_rules) ? data.recurring_rules : []
      })
      verifyBackupCounts(manifest, data, receipts.length)

      const oldReceipts = (
        await query(
          `SELECT receipt_path FROM income WHERE user_id = ? AND receipt_path IS NOT NULL
           UNION
           SELECT receipt_path FROM debts WHERE user_id = ? AND receipt_path IS NOT NULL
           UNION
           SELECT p.receipt_path FROM debt_payments p
             JOIN debts d ON d.id = p.debt_id
             WHERE d.user_id = ? AND p.receipt_path IS NOT NULL`,
          [userId, userId, userId]
        )
      ).map((row) => row.receipt_path)

      const incomeRows = Array.isArray(data.income) ? data.income : []
      const expenseRows = Array.isArray(data.expenses) ? data.expenses : []
      const debtRows = Array.isArray(data.debts) ? data.debts : []
      const paymentRows = Array.isArray(data.debt_payments) ? data.debt_payments : []
      const budgetRows = Array.isArray(data.budgets) ? data.budgets : []
      const goalRows = Array.isArray(data.savings_goals) ? data.savings_goals : []
      const contribRows = Array.isArray(data.savings_contributions) ? data.savings_contributions : []
      const walletRows = Array.isArray(data.wallets) ? data.wallets : []
      const transferRows = Array.isArray(data.wallet_transfers) ? data.wallet_transfers : []
      const recurringRows = Array.isArray(data.recurring_rules) ? data.recurring_rules : []
      const now = new Date().toISOString()

      await transaction(async () => {
        await run(
          'DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE user_id = ?)',
          [userId]
        )
        await run('DELETE FROM debts WHERE user_id = ?', [userId])
        await run(
          'DELETE FROM savings_contributions WHERE goal_id IN (SELECT id FROM savings_goals WHERE user_id = ?)',
          [userId]
        )
        await run('DELETE FROM savings_goals WHERE user_id = ?', [userId])
        await run('DELETE FROM income WHERE user_id = ?', [userId])
        await run('DELETE FROM expenses WHERE user_id = ?', [userId])
        await run('DELETE FROM budgets WHERE user_id = ?', [userId])
        await run('DELETE FROM recurring_rules WHERE user_id = ?', [userId])
        await run('DELETE FROM wallet_transfers WHERE user_id = ?', [userId])
        await run('DELETE FROM wallets WHERE user_id = ?', [userId])

      const walletMap = new Map()
      for (const [index, row] of walletRows.entries()) {
        const wallet = validateWalletInput(row)
        const info = await run(
          `INSERT INTO wallets
            (user_id, name, type, style, opening_balance, last4, color, card_image, sort_order,
             is_archived, interest_enabled, interest_rate, interest_crediting, interest_withholding,
             credit_limit, statement_day, due_day, minimum_payment, apr, track_only,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            wallet.name,
            wallet.type,
            wallet.style,
            wallet.opening_balance,
            wallet.last4,
            wallet.color,
            wallet.card_image,
            row.sort_order ?? index,
            row.is_archived ? 1 : 0,
            wallet.interest_enabled,
            wallet.interest_rate,
            wallet.interest_crediting,
            wallet.interest_withholding,
            wallet.credit_limit,
            wallet.statement_day,
            wallet.due_day,
            wallet.minimum_payment,
            wallet.apr,
            wallet.track_only,
            row.created_at ?? now,
            row.updated_at ?? null
          ]
        )
        if (row.id != null) walletMap.set(row.id, info.lastId)
      }
      let cash = await getOne(
        "SELECT id FROM wallets WHERE user_id = ? AND type = 'cash' ORDER BY sort_order ASC, id ASC LIMIT 1",
        [userId]
      )
      if (!cash) {
        const next = await getOne(
          'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM wallets WHERE user_id = ?',
          [userId]
        )
        const info = await run(
          `INSERT INTO wallets
            (user_id, name, type, style, opening_balance, sort_order, created_at)
           VALUES (?, 'Cash', 'cash', 'cash', 0, ?, ?)`,
          [userId, next?.next ?? 0, now]
        )
        cash = { id: info.lastId }
      }
      const resolveWallet = (value) =>
        value != null && walletMap.has(value) ? walletMap.get(value) : cash.id

      const incomeMap = new Map()
      for (const row of incomeRows) {
        const receipt =
          row.receipt_path && included.has(row.receipt_path) ? row.receipt_path : null
        const info = await run(
          `INSERT INTO income (user_id, wallet_id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            resolveWallet(row.wallet_id),
            num(row.amount),
            row.date,
            row.source ?? null,
            row.notes ?? null,
            receipt,
            row.is_archived ? 1 : 0,
            row.created_at ?? now,
            row.updated_at ?? null
          ]
        )
        if (row.id != null) incomeMap.set(row.id, info.lastId)
      }

      for (const row of expenseRows) {
        await run(
          `INSERT INTO expenses (user_id, wallet_id, category, amount, date, notes, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            resolveWallet(row.wallet_id),
            row.category,
            num(row.amount),
            row.date,
            row.notes ?? null,
            row.is_archived ? 1 : 0,
            row.created_at ?? now,
            row.updated_at ?? null
          ]
        )
      }

      const debtMap = new Map()
      for (const row of debtRows) {
        const receipt =
          row.receipt_path && included.has(row.receipt_path) ? row.receipt_path : null
        const info = await run(
          `INSERT INTO debts (user_id, wallet_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
                              payment_type, monthly_amount, payment_day, first_payment_date, receipt_path,
                              status, notes, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            resolveWallet(row.wallet_id),
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
          ]
        )
        if (row.id != null) debtMap.set(row.id, info.lastId)
      }

      for (const row of paymentRows) {
        const debtId = debtMap.get(row.debt_id)
        if (!debtId) continue
        const receipt =
          row.receipt_path && included.has(row.receipt_path) ? row.receipt_path : null
        await run(
          `INSERT INTO debt_payments (debt_id, wallet_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            debtId,
            resolveWallet(row.wallet_id),
            num(row.amount),
            row.date,
            row.notes ?? null,
            row.payment_type ?? 'payment',
            row.installment_due ?? null,
            receipt,
            row.created_at ?? now
          ]
        )
      }

      for (const row of transferRows) {
        const fromWallet = resolveWallet(row.from_wallet_id)
        const toWallet = resolveWallet(row.to_wallet_id)
        if (fromWallet === toWallet) continue
        await run(
          `INSERT INTO wallet_transfers
            (user_id, from_wallet_id, to_wallet_id, amount, date, notes, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            fromWallet,
            toWallet,
            num(row.amount),
            row.date,
            row.notes ?? null,
            row.is_archived ? 1 : 0,
            row.created_at ?? now,
            row.updated_at ?? null
          ]
        )
      }

      for (const row of budgetRows) {
        await run(
          `INSERT INTO budgets (user_id, category, monthly_limit, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (user_id, category)
           DO UPDATE SET monthly_limit = excluded.monthly_limit,
                         is_archived = excluded.is_archived,
                         updated_at = excluded.updated_at`,
          [
            userId,
            row.category,
            num(row.monthly_limit),
            row.is_archived ? 1 : 0,
            row.created_at ?? now,
            row.updated_at ?? null
          ]
        )
      }

      const goalMap = new Map()
      for (const row of goalRows) {
        const info = await run(
          `INSERT INTO savings_goals (user_id, goal_name, target_amount, current_amount, deadline, wallet_id, kind, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            row.goal_name,
            num(row.target_amount),
            num(row.current_amount),
            row.deadline ?? null,
            row.wallet_id != null ? resolveWallet(row.wallet_id) : null,
            row.kind === 'sinking' ? 'sinking' : 'goal',
            row.is_archived ? 1 : 0,
            row.created_at ?? now,
            row.updated_at ?? null
          ]
        )
        if (row.id != null) goalMap.set(row.id, info.lastId)
      }

      for (const row of contribRows) {
        const goalId = goalMap.get(row.goal_id)
        if (!goalId) continue
        const incomeId = row.income_id != null ? incomeMap.get(row.income_id) ?? null : null
        await run(
          `INSERT INTO savings_contributions (goal_id, income_id, amount, date, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [goalId, incomeId, num(row.amount), row.date, row.notes ?? null, row.created_at ?? now]
        )
      }

      for (const row of recurringRows) {
        await run(
          `INSERT INTO recurring_rules
            (user_id, name, kind, wallet_id, category, amount, frequency, next_due, reminder_days, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            row.name,
            row.kind,
            resolveWallet(row.wallet_id),
            row.category ?? null,
            num(row.amount),
            row.frequency,
            row.next_due,
            row.reminder_days ?? 3,
            row.is_archived ? 1 : 0,
            row.created_at ?? now,
            row.updated_at ?? null
          ]
        )
      }
      })

      for (const name of oldReceipts) {
        if (!name || included.has(name) || !RECEIPT_FILE_PATTERN.test(name)) continue
        await Filesystem.deleteFile({ path: `${RECEIPTS_DIR}/${name}`, directory: Directory.Data }).catch(
          () => {}
        )
      }
      await Filesystem.mkdir({
        path: RECEIPTS_DIR,
        directory: Directory.Data,
        recursive: true
      }).catch(() => {})
      for (const receipt of receipts) {
        await Filesystem.writeFile({
          path: `${RECEIPTS_DIR}/${receipt.name}`,
          data: receipt.base64,
          directory: Directory.Data,
          recursive: true
        })
      }

      return {
        imported: true,
        username,
        counts: {
          income: incomeRows.length,
          expenses: expenseRows.length,
          debts: debtRows.length,
          debtPayments: paymentRows.length,
          budgets: budgetRows.length,
          savingsGoals: goalRows.length,
          savingsContributions: contribRows.length,
          wallets: walletRows.length,
          walletTransfers: transferRows.length,
          recurringRules: recurringRows.length,
          receipts: receipts.length
        }
      }
    }
  }

  const account = {
    deleteData: async (passwordRaw) => {
      const userId = requireUserId()
      const record = await getOne('SELECT * FROM users WHERE id = ?', [userId])
      if (!record) throw new Error('Account not found')
      if (!bcrypt.compareSync(String(passwordRaw ?? ''), record.password_hash)) {
        throw new Error('Password is incorrect')
      }
      const receiptRows = await query(
        `SELECT receipt_path FROM income WHERE user_id = ? AND receipt_path IS NOT NULL
         UNION
         SELECT receipt_path FROM debts WHERE user_id = ? AND receipt_path IS NOT NULL
         UNION
         SELECT p.receipt_path FROM debt_payments p
           JOIN debts d ON d.id = p.debt_id
           WHERE d.user_id = ? AND p.receipt_path IS NOT NULL`,
        [userId, userId, userId]
      )
      await executeSet([
        {
          statement:
            'DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE user_id = ?)',
          values: [userId]
        },
        { statement: 'DELETE FROM debts WHERE user_id = ?', values: [userId] },
        {
          statement:
            'DELETE FROM savings_contributions WHERE goal_id IN (SELECT id FROM savings_goals WHERE user_id = ?)',
          values: [userId]
        },
        { statement: 'DELETE FROM savings_goals WHERE user_id = ?', values: [userId] },
        { statement: 'DELETE FROM income WHERE user_id = ?', values: [userId] },
        { statement: 'DELETE FROM expenses WHERE user_id = ?', values: [userId] },
        { statement: 'DELETE FROM budgets WHERE user_id = ?', values: [userId] },
        { statement: 'DELETE FROM recurring_rules WHERE user_id = ?', values: [userId] },
        { statement: 'DELETE FROM wallet_transfers WHERE user_id = ?', values: [userId] },
        { statement: 'DELETE FROM wallets WHERE user_id = ?', values: [userId] },
        {
          statement:
            "INSERT INTO wallets (user_id, name, type, style, opening_balance, sort_order) VALUES (?, 'Cash', 'cash', 'cash', 0, 0)",
          values: [userId]
        }
      ])
      for (const row of receiptRows) {
        if (row.receipt_path) {
          await Filesystem.deleteFile({
            path: `${RECEIPTS_DIR}/${row.receipt_path}`,
            directory: Directory.Data
          }).catch(() => {})
        }
      }
      return { deleted: true }
    }
  }

  const recurring = {
    list: async () => {
      const userId = requireUserId()
      return query(
        'SELECT * FROM recurring_rules WHERE user_id = ? AND is_archived = 0 ORDER BY next_due ASC, id ASC',
        [userId]
      )
    },
    create: async (data) => {
      const userId = requireUserId()
      const wallets = await query('SELECT id FROM wallets WHERE user_id = ? AND is_archived = 0', [userId])
      const row = validateRecurringInput(data, { wallets })
      const info = await run(
        `INSERT INTO recurring_rules (user_id, name, kind, wallet_id, category, amount, frequency, next_due, reminder_days)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, row.name, row.kind, row.wallet_id, row.category, row.amount, row.frequency, row.next_due, row.reminder_days]
      )
      return getOne('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?', [info.lastId, userId])
    },
    update: async (id, data) => {
      const userId = requireUserId()
      const wallets = await query('SELECT id FROM wallets WHERE user_id = ? AND is_archived = 0', [userId])
      const row = validateRecurringInput(data, { wallets })
      const info = await run(
        `UPDATE recurring_rules SET name = ?, kind = ?, wallet_id = ?, category = ?, amount = ?,
           frequency = ?, next_due = ?, reminder_days = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [row.name, row.kind, row.wallet_id, row.category, row.amount, row.frequency, row.next_due, row.reminder_days, validateId(id), userId]
      )
      if (info.changes === 0) return null
      return getOne('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?', [id, userId])
    },
    remove: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE recurring_rules SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0',
        [validateId(id), userId]
      )
      return info.changes > 0
    },
    restore: async (id) => {
      const userId = requireUserId()
      const info = await run(
        'UPDATE recurring_rules SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1',
        [validateId(id), userId]
      )
      return info.changes > 0
    },
    archived: async () => {
      const userId = requireUserId()
      return query('SELECT * FROM recurring_rules WHERE user_id = ? AND is_archived = 1 ORDER BY id DESC', [userId])
    },
    post: async (id) => {
      const userId = requireUserId()
      const rule = await getOne('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?', [validateId(id), userId])
      if (!rule || rule.is_archived) return null
      await transaction(async () => {
        if (rule.kind === 'income') {
          await run(
            'INSERT INTO income (user_id, wallet_id, amount, date, source, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, rule.wallet_id, rule.amount, rule.next_due, rule.name, 'Recurring income']
          )
        } else {
          await run(
            'INSERT INTO expenses (user_id, wallet_id, category, amount, date, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, rule.wallet_id, rule.category || 'other', rule.amount, rule.next_due, `Recurring: ${rule.name}`]
          )
        }
        await run(
          'UPDATE recurring_rules SET next_due = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
          [advanceDue(rule.next_due, rule.frequency), rule.id, userId]
        )
      })
      return getOne('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?', [rule.id, userId])
    },
    skip: async (id) => {
      const userId = requireUserId()
      const rule = await getOne('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?', [validateId(id), userId])
      if (!rule || rule.is_archived) return null
      await run(
        'UPDATE recurring_rules SET next_due = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        [advanceDue(rule.next_due, rule.frequency), rule.id, userId]
      )
      return getOne('SELECT * FROM recurring_rules WHERE id = ? AND user_id = ?', [rule.id, userId])
    }
  }

  return {
    platform: 'android',
    auth,
    wallets,
    settings,
    income,
    expenses,
    debts,
    budgets,
    savings,
    recurring,
    reports,
    files,
    backup,
    account
  }
}
