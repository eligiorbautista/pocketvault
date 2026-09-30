import { toCents, fromCents } from '../../../shared/money.js'
import { monthRange } from './helpers.js'

export function listMonthly(db, userId, month) {
  const { from, to } = monthRange(month)
  const budgets = db
    .prepare(
      `SELECT id, user_id, category, monthly_limit, is_archived, created_at, updated_at
       FROM budgets WHERE user_id = ? AND is_archived = 0 ORDER BY category ASC`
    )
    .all(userId)

  const spentRows = db
    .prepare(
      `SELECT category, amount FROM expenses
       WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0`
    )
    .all(userId, from, to)

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

export function upsert(db, userId, { category, monthly_limit }) {
  db.prepare(
    `INSERT INTO budgets (user_id, category, monthly_limit, is_archived, updated_at)
     VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, category)
     DO UPDATE SET monthly_limit = excluded.monthly_limit,
                   is_archived = 0,
                   updated_at = CURRENT_TIMESTAMP`
  ).run(userId, category, monthly_limit)
  return db
    .prepare(
      'SELECT id, user_id, category, monthly_limit, is_archived, created_at, updated_at FROM budgets WHERE user_id = ? AND category = ?'
    )
    .get(userId, category)
}

export function remove(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE budgets SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0'
      )
      .run(id, userId).changes > 0
  )
}

export function restore(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE budgets SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1'
      )
      .run(id, userId).changes > 0
  )
}

export function listArchived(db, userId) {
  return db
    .prepare(
      `SELECT id, user_id, category, monthly_limit, is_archived, created_at, updated_at
       FROM budgets WHERE user_id = ? AND is_archived = 1 ORDER BY category ASC`
    )
    .all(userId)
}
