import { advanceDue } from '../../../shared/recurring.js'

const COLUMNS =
  'id, user_id, name, kind, wallet_id, category, amount, frequency, next_due, reminder_days, is_archived, created_at, updated_at'

export function list(db, userId) {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM recurring_rules
       WHERE user_id = ? AND is_archived = 0 ORDER BY next_due ASC, id ASC`
    )
    .all(userId)
}

export function getById(db, userId, id) {
  return db
    .prepare(`SELECT ${COLUMNS} FROM recurring_rules WHERE id = ? AND user_id = ?`)
    .get(id, userId)
}

export function create(db, userId, data) {
  const info = db
    .prepare(
      `INSERT INTO recurring_rules
        (user_id, name, kind, wallet_id, category, amount, frequency, next_due, reminder_days, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run(
      userId,
      data.name,
      data.kind,
      data.wallet_id,
      data.category,
      data.amount,
      data.frequency,
      data.next_due,
      data.reminder_days
    )
  return getById(db, userId, info.lastInsertRowid)
}

export function update(db, userId, id, data) {
  const info = db
    .prepare(
      `UPDATE recurring_rules
       SET name = ?, kind = ?, wallet_id = ?, category = ?, amount = ?, frequency = ?,
           next_due = ?, reminder_days = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    )
    .run(
      data.name,
      data.kind,
      data.wallet_id,
      data.category,
      data.amount,
      data.frequency,
      data.next_due,
      data.reminder_days,
      id,
      userId
    )
  if (info.changes === 0) return null
  return getById(db, userId, id)
}

export function remove(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE recurring_rules SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0'
      )
      .run(id, userId).changes > 0
  )
}

export function restore(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE recurring_rules SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1'
      )
      .run(id, userId).changes > 0
  )
}

export function listArchived(db, userId) {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM recurring_rules WHERE user_id = ? AND is_archived = 1 ORDER BY id DESC`
    )
    .all(userId)
}

// Posting creates exactly one income/expense row and advances next_due. There is
// no separate occurrence table, so a rule cannot post twice for the same date.
export function post(db, userId, id) {
  const rule = getById(db, userId, id)
  if (!rule || rule.is_archived) return null
  const next = advanceDue(rule.next_due, rule.frequency)
  const run = db.transaction(() => {
    if (rule.kind === 'income') {
      db.prepare(
        `INSERT INTO income (user_id, wallet_id, amount, date, source, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(userId, rule.wallet_id, rule.amount, rule.next_due, rule.name, 'Recurring income')
    } else {
      db.prepare(
        `INSERT INTO expenses (user_id, wallet_id, category, amount, date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(userId, rule.wallet_id, rule.category || 'other', rule.amount, rule.next_due, `Recurring: ${rule.name}`)
    }
    db.prepare(
      'UPDATE recurring_rules SET next_due = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
    ).run(next, id, userId)
  })
  run()
  return getById(db, userId, id)
}

export function skip(db, userId, id) {
  const rule = getById(db, userId, id)
  if (!rule || rule.is_archived) return null
  db.prepare(
    'UPDATE recurring_rules SET next_due = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(advanceDue(rule.next_due, rule.frequency), id, userId)
  return getById(db, userId, id)
}
