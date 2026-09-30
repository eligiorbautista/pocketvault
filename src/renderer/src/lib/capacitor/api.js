import bcrypt from 'bcryptjs'
import { Directory, Filesystem } from '@capacitor/filesystem'
import {
  DEBT_PAYMENT_TYPE_VALUES,
  MAX_RECEIPT_BYTES,
  PAGE_SIZE,
  RECEIPT_EXTENSIONS
} from '@shared/constants.js'
import { DEFAULT_CURRENCY } from '@shared/currency.js'
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
const INCOME_COLUMNS =
  'id, user_id, amount, date, source, notes, receipt_path, is_archived, created_at, updated_at'
const EXPENSE_COLUMNS =
  'id, user_id, category, amount, date, notes, is_archived, created_at, updated_at'
const GOAL_COLUMNS =
  'id, user_id, goal_name, target_amount, current_amount, deadline, is_archived, created_at, updated_at'
const DEBT_COLUMNS = `id, user_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
  payment_type, monthly_amount, payment_day, status, notes, is_archived, created_at, updated_at`

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

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    input.onchange = () => {
      const file = input.files && input.files[0] ? input.files[0] : null
      input.remove()
      resolve(file)
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
        'SELECT user_id, currency, require_password_on_start, updated_at FROM user_settings WHERE user_id = ?',
        [userId]
      )
      if (!row) return { currency: DEFAULT_CURRENCY, requirePasswordOnStart: false }
      return {
        currency: row.currency || DEFAULT_CURRENCY,
        requirePasswordOnStart: Boolean(row.require_password_on_start)
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
      await run(
        `INSERT INTO user_settings (user_id, currency, require_password_on_start, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id)
         DO UPDATE SET currency = excluded.currency,
                       require_password_on_start = excluded.require_password_on_start,
                       updated_at = CURRENT_TIMESTAMP`,
        [userId, nextCurrency, nextRequire ? 1 : 0]
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
      const remaining = fromCents(toCents(validateAmount(data.total_amount, 'total_amount')))
      const info = await run(
        `INSERT INTO debts
          (user_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
           payment_type, monthly_amount, payment_day, status, notes, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, 'unpaid', ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          validateText(data.creditor, 'creditor', { required: true, max: 120 }),
          data.total_amount,
          remaining,
          validateDate(data.due_date, 'due_date', { required: false }),
          validatePaymentType(data.payment_type, DEBT_PAYMENT_TYPE_VALUES),
          data.monthly_amount ? validateAmount(data.monthly_amount, 'monthly_amount') : null,
          data.payment_day ? validateInt(data.payment_day, 'payment_day') : null,
          validateText(data.notes, 'notes')
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
      const paid = toCents(current.paid_amount)
      const remaining = fromCents(Math.max(0, toCents(validateAmount(data.total_amount, 'total_amount')) - paid))
      const info = await run(
        `UPDATE debts
         SET creditor = ?, total_amount = ?, remaining_amount = ?, due_date = ?,
             payment_type = ?, monthly_amount = ?, payment_day = ?, notes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [
          validateText(data.creditor, 'creditor', { required: true, max: 120 }),
          data.total_amount,
          remaining,
          validateDate(data.due_date, 'due_date', { required: false }),
          validatePaymentType(data.payment_type, DEBT_PAYMENT_TYPE_VALUES),
          data.monthly_amount ? validateAmount(data.monthly_amount, 'monthly_amount') : null,
          data.payment_day ? validateInt(data.payment_day, 'payment_day') : null,
          validateText(data.notes, 'notes'),
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
        `SELECT id, debt_id, amount, date, notes, payment_type, created_at
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
      await run(
        `INSERT INTO debt_payments (debt_id, amount, date, notes, payment_type)
         VALUES (?, ?, ?, ?, 'payment')`,
        [id, amount, date, notes]
      )
      await syncDebtStatus(id, userId)
      return getDebtById(userId, id)
    },

    reborrow: async (debtId, data) => {
      const userId = requireUserId()
      const id = validateId(debtId, 'debtId')
      const debt = await getOne('SELECT * FROM debts WHERE id = ? AND user_id = ?', [id, userId])
      if (!debt) return null
      const amount = validateAmount(data.amount)
      const date = validateDate(data.date)
      const notes = validateText(data.notes, 'notes')
      const newTotal = fromCents(toCents(debt.total_amount) + toCents(amount))
      await run(
        `INSERT INTO debt_payments (debt_id, amount, date, notes, payment_type)
         VALUES (?, ?, ?, ?, 'reborrow')`,
        [id, amount, date, notes]
      )
      await run('UPDATE debts SET total_amount = ? WHERE id = ?', [newTotal, id])
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
      if (payment.payment_type === 'reborrow') {
        const debt = await getOne('SELECT * FROM debts WHERE id = ?', [payment.debt_id])
        const newTotal = fromCents(Math.max(0, toCents(debt.total_amount) - toCents(payment.amount)))
        await run('UPDATE debts SET total_amount = ? WHERE id = ?', [newTotal, payment.debt_id])
      }
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
    export: async () => {
      const userId = requireUserId()
      const payload = {
        app: 'PocketVault',
        format: 'json',
        version: 1,
        username: session.username,
        exportedAt: new Date().toISOString(),
        data: {
          settings: await settings.get(),
          income: await query(`SELECT ${INCOME_COLUMNS} FROM income WHERE user_id = ?`, [userId]),
          expenses: await query(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE user_id = ?`, [userId]),
          debts: await query(`SELECT ${DEBT_COLUMNS} FROM debts WHERE user_id = ?`, [userId]),
          debtPayments: await query(
            `SELECT p.* FROM debt_payments p JOIN debts d ON d.id = p.debt_id WHERE d.user_id = ?`,
            [userId]
          ),
          budgets: await query(
            'SELECT id, user_id, category, monthly_limit, is_archived, created_at, updated_at FROM budgets WHERE user_id = ?',
            [userId]
          ),
          savingsGoals: await query(
            `SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE user_id = ?`,
            [userId]
          ),
          savingsContributions: await query(
            `SELECT c.* FROM savings_contributions c JOIN savings_goals g ON g.id = c.goal_id WHERE g.user_id = ?`,
            [userId]
          )
        }
      }
      const name = `pocketvault-${session.username}-backup.json`
      const result = await Filesystem.writeFile({
        path: name,
        data: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2)))),
        directory: Directory.Data,
        recursive: true
      })
      return { saved: true, path: result.uri }
    },

    import: async () => {
      throw new Error('Backup import from file is not available on mobile yet')
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
        'SELECT receipt_path FROM income WHERE user_id = ? AND receipt_path IS NOT NULL',
        [userId]
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
