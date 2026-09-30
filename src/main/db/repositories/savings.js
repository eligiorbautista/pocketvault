import { fromCents, toCents } from '../../../shared/money.js'

const GOAL_COLUMNS =
  'id, user_id, goal_name, target_amount, current_amount, deadline, is_archived, created_at, updated_at'

function syncCurrentAmount(db, goalId, userId) {
  const total = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM savings_contributions WHERE goal_id = ?')
    .get(goalId).total
  const current = fromCents(toCents(total))
  db.prepare(
    'UPDATE savings_goals SET current_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(current, goalId, userId)
}

function decorate(goal) {
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

export function list(db, userId) {
  const rows = db
    .prepare(
      `SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE user_id = ? AND is_archived = 0 ORDER BY created_at DESC, id DESC`
    )
    .all(userId)
  return rows.map(decorate)
}

export function getById(db, userId, id) {
  return decorate(
    db.prepare(`SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE id = ? AND user_id = ?`).get(id, userId)
  )
}

export function create(db, userId, data) {
  const info = db
    .prepare(
      `INSERT INTO savings_goals (user_id, goal_name, target_amount, current_amount, deadline, updated_at)
       VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)`
    )
    .run(userId, data.goal_name, data.target_amount, data.deadline)
  return getById(db, userId, info.lastInsertRowid)
}

export function update(db, userId, id, data) {
  const info = db
    .prepare(
      `UPDATE savings_goals
       SET goal_name = ?, target_amount = ?, deadline = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    )
    .run(data.goal_name, data.target_amount, data.deadline, id, userId)
  if (info.changes === 0) return null
  return getById(db, userId, id)
}

export function remove(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE savings_goals SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0'
      )
      .run(id, userId).changes > 0
  )
}

export function restore(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE savings_goals SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1'
      )
      .run(id, userId).changes > 0
  )
}

export function listArchived(db, userId) {
  const rows = db
    .prepare(
      `SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE user_id = ? AND is_archived = 1 ORDER BY created_at DESC, id DESC`
    )
    .all(userId)
  return rows.map(decorate)
}

export function listContributions(db, userId, goalId) {
  const goal = db.prepare('SELECT id FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, userId)
  if (!goal) return null
  return db
    .prepare(
      `SELECT c.id, c.goal_id, c.income_id, c.amount, c.date, c.notes, c.created_at,
              i.source AS income_source
       FROM savings_contributions c
       LEFT JOIN income i ON i.id = c.income_id
       WHERE c.goal_id = ? ORDER BY c.date DESC, c.id DESC`
    )
    .all(goalId)
}

export function addContribution(db, userId, goalId, data) {
  const goal = db.prepare('SELECT id FROM savings_goals WHERE id = ? AND user_id = ?').get(goalId, userId)
  if (!goal) return null
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO savings_contributions (goal_id, income_id, amount, date, notes)
       VALUES (?, ?, ?, ?, ?)`
    ).run(goalId, data.income_id, data.amount, data.date, data.notes)
    syncCurrentAmount(db, goalId, userId)
  })
  run()
  return getById(db, userId, goalId)
}

export function removeContribution(db, userId, contributionId) {
  const row = db
    .prepare(
      `SELECT c.* FROM savings_contributions c
       JOIN savings_goals g ON g.id = c.goal_id
       WHERE c.id = ? AND g.user_id = ?`
    )
    .get(contributionId, userId)
  if (!row) return null
  const run = db.transaction(() => {
    db.prepare('DELETE FROM savings_contributions WHERE id = ?').run(contributionId)
    syncCurrentAmount(db, row.goal_id, userId)
  })
  run()
  return getById(db, userId, row.goal_id)
}

export function totalSaved(db, userId) {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(current_amount), 0) AS total FROM savings_goals WHERE user_id = ? AND is_archived = 0'
    )
    .get(userId)
  return row.total
}
