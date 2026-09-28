import { toCents, fromCents } from '../../../shared/money.js'
import { monthRange } from './helpers.js'

export function listMonthly(db, userId, month) {
  const { from, to } = monthRange(month)
  const budgets = db
    .prepare(
      `SELECT id, user_id, category, monthly_limit, created_at, updated_at
       FROM budgets WHERE user_id = ? ORDER BY category ASC`
    )
    .all(userId)

  const spentRows = db
    .prepare(
      `SELECT category, amount FROM expenses
       WHERE user_id = ? AND date >= ? AND date <= ?`
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
    `INSERT INTO budgets (user_id, category, monthly_limit, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, category)
     DO UPDATE SET monthly_limit = excluded.monthly_limit, updated_at = CURRENT_TIMESTAMP`
  ).run(userId, category, monthly_limit)
  return db
    .prepare('SELECT id, user_id, category, monthly_limit, created_at, updated_at FROM budgets WHERE user_id = ? AND category = ?')
    .get(userId, category)
}

export function remove(db, userId, id) {
  return db.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
}
