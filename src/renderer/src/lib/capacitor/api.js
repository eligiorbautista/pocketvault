import bcrypt from 'bcryptjs'
import JSZip from 'jszip'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import {
  DEBT_PAYMENT_TYPE_VALUES,
  MAX_BACKUP_RECEIPTS_BYTES,
  MAX_RECEIPT_BYTES,
  PAGE_SIZE,
  RECEIPT_EXTENSIONS,
  RECEIPT_FILE_PATTERN
} from '@shared/constants.js'
import { DEFAULT_CURRENCY } from '@shared/currency.js'
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
import { executeSet, getOne, paginate, query, run } from './sqlite.js'

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf'
}

const RECEIPTS_DIR = 'receipts'
const BACKUP_FORMAT = 2
const BACKUP_RECEIPTS_PREFIX = 'receipts/'
const INCOME_COLUMNS =
  'id, user_id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at'
const EXPENSE_COLUMNS =
  'id, user_id, category, amount, date, notes, is_archived, created_at, updated_at'
const GOAL_COLUMNS =
  'id, user_id, goal_name, target_amount, current_amount, deadline, is_archived, created_at, updated_at'
const DEBT_COLUMNS = `id, user_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
  payment_type, monthly_amount, payment_day, first_payment_date, receipt_path, status, notes,
  is_archived, created_at, updated_at`

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
       SUM(CASE WHEN remaining_amount > 0 AND due_date IS NOT NULL AND due_date < date('now') THEN 1 ELSE 0 END) AS overdue_count
     FROM debts WHERE user_id = ? AND is_archived = 0`,
    [userId]
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
      const info = await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [
        username,
        hash
      ])
      const record = await getOne('SELECT id, username FROM users WHERE id = ?', [info.lastId])
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
      const newPassword = String(newPasswordRaw ?? '')
      if (!bcrypt.compareSync(currentPassword, record.password_hash)) {
        throw new Error('Current password is incorrect')
      }
      if (!newPassword) throw new Error('New password is required')
      await run('UPDATE users SET password_hash = ? WHERE id = ?', [
        bcrypt.hashSync(newPassword, 10),
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
      const info = await run(
        `INSERT INTO income (user_id, amount, date, source, notes, receipt_path, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          validateAmount(data.amount),
          validateDate(data.date),
          validateText(data.source, 'source', { max: 120 }),
          validateText(data.notes, 'notes'),
          data.receipt_path ?? null
        ]
      )
      return getOne(`SELECT ${INCOME_COLUMNS} FROM income WHERE id = ? AND user_id = ?`, [
        info.lastId,
        userId
      ])
    },

    update: async (id, data) => {
      const userId = requireUserId()
      const info = await run(
        `UPDATE income
         SET amount = ?, date = ?, source = ?, notes = ?, receipt_path = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          validateAmount(data.amount),
          validateDate(data.date),
          validateText(data.source, 'source', { max: 120 }),
          validateText(data.notes, 'notes'),
          data.receipt_path ?? null,
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
      const info = await run(
        `INSERT INTO expenses (user_id, category, amount, date, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
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
      const info = await run(
        `UPDATE expenses
         SET category = ?, amount = ?, date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
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
      const remaining = fromCents(toCents(row.total_amount))
      const info = await run(
        `INSERT INTO debts
          (user_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
           payment_type, monthly_amount, payment_day, first_payment_date, receipt_path, status, notes, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, CURRENT_TIMESTAMP)`,
        [
          userId,
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
      const paid = toCents(current.paid_amount)
      const remaining = fromCents(Math.max(0, toCents(row.total_amount) - paid))
      const info = await run(
        `UPDATE debts
         SET creditor = ?, total_amount = ?, remaining_amount = ?, due_date = ?,
             payment_type = ?, monthly_amount = ?, payment_day = ?, first_payment_date = ?,
             receipt_path = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
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
        `SELECT id, debt_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at
         FROM debt_payments WHERE debt_id = ? ORDER BY date DESC, id DESC`,
        [id]
      )
    },

    addPayment: async (debtId, data) => {
      const userId = requireUserId()
      const id = validateId(debtId, 'debtId')
      const debt = await getOne('SELECT id FROM debts WHERE id = ? AND user_id = ?', [id, userId])
      if (!debt) return null
      const amount = validateAmount(data.amount)
      const date = validateDate(data.date)
      const notes = validateText(data.notes, 'notes')
      const installmentDue = data.installment_due
        ? validateDate(data.installment_due, 'installment_due')
        : null
      await run(
        `INSERT INTO debt_payments (debt_id, amount, date, notes, payment_type, installment_due, receipt_path)
         VALUES (?, ?, ?, ?, 'payment', ?, ?)`,
        [id, amount, date, notes, installmentDue, normalizeReceipt(data.receipt_path)]
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
        `INSERT INTO savings_goals (user_id, goal_name, target_amount, current_amount, deadline, updated_at)
         VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          validateText(data.goal_name, 'goal_name', { required: true, max: 120 }),
          validateAmount(data.target_amount, 'target_amount'),
          validateDate(data.deadline, 'deadline', { required: false })
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
         SET goal_name = ?, target_amount = ?, deadline = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          validateText(data.goal_name, 'goal_name', { required: true, max: 120 }),
          validateAmount(data.target_amount, 'target_amount'),
          validateDate(data.deadline, 'deadline', { required: false }),
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
         LEFT JOIN income i ON i.id = c.income_id
         WHERE c.goal_id = ? ORDER BY c.date DESC, c.id DESC`,
        [id]
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
      await run(
        `INSERT INTO savings_contributions (goal_id, income_id, amount, date, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          data.income_id ?? null,
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

    saveExport: async ({ defaultName, data } = {}) => {
      const name = String(defaultName ?? 'export').replace(/[\\/]/g, '_')
      const base64 = toBase64(data)
      const result = await Filesystem.writeFile({
        path: name,
        data: base64,
        directory: Directory.Data,
        recursive: true
      })
      return { saved: true, path: result.uri }
    }
  }

  const backup = {
    // Same ZIP layout as the desktop build (manifest + account + data +
    // receipts/), so a backup can be moved between desktop and Android.
    export: async () => {
      const userId = requireUserId()
      const user = await getOne('SELECT id, username, created_at FROM users WHERE id = ?', [userId])
      if (!user) throw new Error('Account not found')

      const income = await query(
        `SELECT id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at
         FROM income WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const expenses = await query(
        `SELECT category, amount, date, notes, is_archived, created_at, updated_at
         FROM expenses WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const debts = await query(
        `SELECT id, creditor, total_amount, paid_amount, remaining_amount, due_date,
                payment_type, monthly_amount, payment_day, first_payment_date, receipt_path,
                status, notes, is_archived, created_at, updated_at
         FROM debts WHERE user_id = ? ORDER BY id`,
        [userId]
      )
      const debtIds = debts.map((row) => row.id)
      const debtPayments = debtIds.length
        ? await query(
            `SELECT debt_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at
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
        `SELECT id, goal_name, target_amount, current_amount, deadline, is_archived, created_at, updated_at
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

      const counts = {
        income: income.length,
        expenses: expenses.length,
        debts: debts.length,
        debtPayments: debtPayments.length,
        budgets: budgets.length,
        savingsGoals: savingsGoals.length,
        savingsContributions: savingsContributions.length,
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
            savings_contributions: savingsContributions
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

      const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
      const name = `pocketvault-${user.username}-backup-${stamp()}.zip`
      const written = await Filesystem.writeFile({
        path: name,
        data: base64,
        directory: Directory.Cache,
        recursive: true
      })

      // Hand the file to the Android share sheet so it can be saved to Files,
      // Drive, or sent anywhere (no storage permission required).
      await Share.share({
        title: 'PocketVault backup',
        text: `PocketVault backup for ${user.username}`,
        url: written.uri,
        dialogTitle: 'Save or share your backup'
      })

      return { saved: true, path: written.uri, counts }
    },

    import: async () => {
      const userId = requireUserId()
      const user = await getOne('SELECT id, username FROM users WHERE id = ?', [userId])
      if (!user) throw new Error('Account not found')

      const file = await pickFile('.zip,application/zip')
      if (!file) return { imported: false }

      const buffer = await readAsArrayBuffer(file)
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

      if (!manifest || manifest.format !== BACKUP_FORMAT) {
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
      const now = new Date().toISOString()

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
        { statement: 'DELETE FROM budgets WHERE user_id = ?', values: [userId] }
      ])

      const incomeMap = new Map()
      for (const row of incomeRows) {
        const receipt =
          row.receipt_path && included.has(row.receipt_path) ? row.receipt_path : null
        const info = await run(
          `INSERT INTO income (user_id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
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
          `INSERT INTO expenses (user_id, category, amount, date, notes, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
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
          `INSERT INTO debts (user_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
                              payment_type, monthly_amount, payment_day, first_payment_date, receipt_path,
                              status, notes, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
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
          `INSERT INTO debt_payments (debt_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            debtId,
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
          `INSERT INTO savings_goals (user_id, goal_name, target_amount, current_amount, deadline, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            row.goal_name,
            num(row.target_amount),
            num(row.current_amount),
            row.deadline ?? null,
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
        { statement: 'DELETE FROM budgets WHERE user_id = ?', values: [userId] }
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

  return {
    platform: 'android',
    auth,
    settings,
    income,
    expenses,
    debts,
    budgets,
    savings,
    reports,
    files,
    backup,
    account
  }
}
