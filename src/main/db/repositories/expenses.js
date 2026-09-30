import { PAGE_SIZE } from '../../../shared/constants.js'
import { runPaginated } from './helpers.js'

const COLUMNS = 'id, user_id, category, amount, date, notes, is_archived, created_at, updated_at'

export function list(db, userId, opts = {}) {
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

  return runPaginated(db, {
    select: `SELECT ${COLUMNS}`,
    from: 'expenses',
    where,
    params,
    orderBy,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? PAGE_SIZE
  })
}

export function getById(db, userId, id) {
  return (
    db.prepare(`SELECT ${COLUMNS} FROM expenses WHERE id = ? AND user_id = ?`).get(id, userId) ?? null
  )
}

export function listAll(db, userId, { from, to } = {}) {
  const where = ['user_id = ?', 'is_archived = 0']
  const params = [userId]
  if (from) {
    where.push('date >= ?')
    params.push(from)
  }
  if (to) {
    where.push('date <= ?')
    params.push(to)
  }
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM expenses WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC`
    )
    .all(...params)
}

export function create(db, userId, data) {
  const info = db
    .prepare(
      `INSERT INTO expenses (user_id, category, amount, date, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run(userId, data.category, data.amount, data.date, data.notes)
  return getById(db, userId, info.lastInsertRowid)
}

export function update(db, userId, id, data) {
  const info = db
    .prepare(
      `UPDATE expenses
       SET category = ?, amount = ?, date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    )
    .run(data.category, data.amount, data.date, data.notes, id, userId)
  if (info.changes === 0) return null
  return getById(db, userId, id)
}

export function remove(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE expenses SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0'
      )
      .run(id, userId).changes > 0
  )
}

export function restore(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE expenses SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1'
      )
      .run(id, userId).changes > 0
  )
}

export function listArchived(db, userId) {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM expenses WHERE user_id = ? AND is_archived = 1 ORDER BY date DESC, id DESC`
    )
    .all(userId)
}

export function spentByCategory(db, userId, { from, to }) {
  return db
    .prepare(
      `SELECT category, amount FROM expenses
       WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0`
    )
    .all(userId, from, to)
}

// Distinct active categories for this user (used to populate filter dropdowns
// so custom categories are selectable).
export function distinctCategories(db, userId) {
  return db
    .prepare(
      'SELECT DISTINCT category FROM expenses WHERE user_id = ? AND is_archived = 0 ORDER BY category ASC'
    )
    .all(userId)
    .map((row) => row.category)
}
