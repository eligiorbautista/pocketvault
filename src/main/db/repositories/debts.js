import { PAGE_SIZE } from '../../../shared/constants.js'
import { fromCents, toCents } from '../../../shared/money.js'
import { runPaginated, todayISO } from './helpers.js'

const COLUMNS = `id, user_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
  payment_type, monthly_amount, payment_day, first_payment_date, receipt_path, status, notes,
  is_archived, created_at, updated_at`

export function effectiveStatus(row, today = todayISO()) {
  if (toCents(row.remaining_amount) <= 0) return 'paid'
  if (row.due_date && row.due_date < today) return 'overdue'
  if (toCents(row.paid_amount) > 0) return 'partial'
  return 'unpaid'
}

function decorate(row, today = todayISO()) {
  if (!row) return null
  return { ...row, effective_status: effectiveStatus(row, today) }
}

export function list(db, userId, opts = {}) {
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

  const result = runPaginated(db, {
    select: `SELECT ${COLUMNS}`,
    from: 'debts',
    where,
    params,
    orderBy,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? PAGE_SIZE
  })

  result.rows = result.rows.map((row) => decorate(row, today))
  return result
}

export function getById(db, userId, id) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM debts WHERE id = ? AND user_id = ?`).get(id, userId)
  return decorate(row)
}

export function create(db, userId, data) {
  const remaining = fromCents(toCents(data.total_amount))
  const info = db
    .prepare(
      `INSERT INTO debts
        (user_id, creditor, total_amount, paid_amount, remaining_amount, due_date,
         payment_type, monthly_amount, payment_day, first_payment_date, receipt_path, status, notes, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, CURRENT_TIMESTAMP)`
    )
    .run(
      userId,
      data.creditor,
      data.total_amount,
      remaining,
      data.due_date,
      data.payment_type,
      data.monthly_amount,
      data.payment_day,
      data.first_payment_date,
      data.receipt_path,
      data.notes
    )
  return getById(db, userId, info.lastInsertRowid)
}

export function update(db, userId, id, data) {
  const current = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(id, userId)
  if (!current) return null
  const paid = toCents(current.paid_amount)
  const remaining = fromCents(Math.max(0, toCents(data.total_amount) - paid))
  const info = db
    .prepare(
      `UPDATE debts
       SET creditor = ?, total_amount = ?, remaining_amount = ?, due_date = ?,
           payment_type = ?, monthly_amount = ?, payment_day = ?, first_payment_date = ?,
           receipt_path = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    )
    .run(
      data.creditor,
      data.total_amount,
      remaining,
      data.due_date,
      data.payment_type,
      data.monthly_amount,
      data.payment_day,
      data.first_payment_date,
      data.receipt_path,
      data.notes,
      id,
      userId
    )
  if (info.changes === 0) return null
  syncStatus(db, id, userId)
  return getById(db, userId, id)
}

export function remove(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE debts SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0'
      )
      .run(id, userId).changes > 0
  )
}

export function restore(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE debts SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1'
      )
      .run(id, userId).changes > 0
  )
}

export function listArchived(db, userId) {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM debts WHERE user_id = ? AND is_archived = 1 ORDER BY created_at DESC, id DESC`
    )
    .all(userId)
  return rows.map((row) => decorate(row))
}

export function listPayments(db, userId, debtId) {
  const debt = db.prepare('SELECT id FROM debts WHERE id = ? AND user_id = ?').get(debtId, userId)
  if (!debt) return null
  return db
    .prepare(
      `SELECT id, debt_id, amount, date, notes, payment_type, installment_due, receipt_path, created_at
       FROM debt_payments WHERE debt_id = ? ORDER BY date DESC, id DESC`
    )
    .all(debtId)
}

export function addPayment(db, userId, debtId, data) {
  const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(debtId, userId)
  if (!debt) return null

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO debt_payments (debt_id, amount, date, notes, payment_type, installment_due, receipt_path)
       VALUES (?, ?, ?, ?, 'payment', ?, ?)`
    ).run(debtId, data.amount, data.date, data.notes, data.installment_due ?? null, data.receipt_path ?? null)
    syncStatus(db, debtId, userId)
  })
  run()
  return getById(db, userId, debtId)
}

export function removePayment(db, userId, paymentId) {
  const payment = db
    .prepare(
      `SELECT p.* FROM debt_payments p
       JOIN debts d ON d.id = p.debt_id
       WHERE p.id = ? AND d.user_id = ?`
    )
    .get(paymentId, userId)
  if (!payment) return null

  const run = db.transaction(() => {
    db.prepare('DELETE FROM debt_payments WHERE id = ?').run(paymentId)
    syncStatus(db, payment.debt_id, userId)
  })
  run()
  return getById(db, userId, payment.debt_id)
}

export function syncStatus(db, debtId, userId) {
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId)
  if (!debt) return
  const paid = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM debt_payments WHERE debt_id = ? AND payment_type = 'payment'")
    .get(debtId).total
  const paidAmount = fromCents(toCents(paid))
  const remaining = fromCents(Math.max(0, toCents(debt.total_amount) - toCents(paid)))
  const status = effectiveStatus(
    { remaining_amount: remaining, paid_amount: paidAmount, due_date: debt.due_date },
    todayISO()
  )
  db.prepare(
    `UPDATE debts SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).run(paidAmount, remaining, status, debtId, userId)
}
