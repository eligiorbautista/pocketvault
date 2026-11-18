import { toCents, fromCents } from '../../../shared/money.js'
import { monthRange } from './helpers.js'

function previousMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function listMonthly(db, userId, month) {
  const { from, to } = monthRange(month)
  const prior = monthRange(previousMonth(month))
  const budgets = db
    .prepare(
      `SELECT id, user_id, category, monthly_limit, rollover, is_archived, created_at, updated_at
       FROM budgets WHERE user_id = ? AND is_archived = 0 ORDER BY category ASC`
    )
    .all(userId)

  const spentRows = db
    .prepare(
      `SELECT category, amount FROM expenses
       WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0`
    )
    .all(userId, from, to)
  const priorRows = db
    .prepare(
      `SELECT category, amount FROM expenses
       WHERE user_id = ? AND date >= ? AND date <= ? AND is_archived = 0`
    )
    .all(userId, prior.from, prior.to)

  const spentMap = new Map()
  for (const row of spentRows) {
    spentMap.set(row.category, (spentMap.get(row.category) ?? 0) + toCents(row.amount))
  }
  const priorMap = new Map()
  for (const row of priorRows) {
    priorMap.set(row.category, (priorMap.get(row.category) ?? 0) + toCents(row.amount))
  }

  return budgets.map((budget) => {
    const spentCents = spentMap.get(budget.category) ?? 0
    const limitCents = toCents(budget.monthly_limit)
    const createdMonth = budget.created_at ? String(budget.created_at).slice(0, 7) : null
    const carryCents =
      budget.rollover && (!createdMonth || createdMonth < month)
        ? Math.max(0, limitCents - (priorMap.get(budget.category) ?? 0))
        : 0
    const availableCents = limitCents + carryCents
    const percent = availableCents > 0 ? (spentCents / availableCents) * 100 : 0
    return {
      ...budget,
      rollover_amount: fromCents(carryCents),
      available: fromCents(availableCents),
      spent: fromCents(spentCents),
      remaining: fromCents(availableCents - spentCents),
      percent: Math.round(percent),
      over: spentCents > availableCents
    }
  })
}

export function upsert(db, userId, { category, monthly_limit, rollover }) {
  db.prepare(
    `INSERT INTO budgets (user_id, category, monthly_limit, rollover, is_archived, updated_at)
     VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, category)
     DO UPDATE SET monthly_limit = excluded.monthly_limit,
                   rollover = excluded.rollover,
                   is_archived = 0,
                   updated_at = CURRENT_TIMESTAMP`
  ).run(userId, category, monthly_limit, rollover ? 1 : 0)
  return db
    .prepare(
      'SELECT id, user_id, category, monthly_limit, rollover, is_archived, created_at, updated_at FROM budgets WHERE user_id = ? AND category = ?'
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
      `SELECT id, user_id, category, monthly_limit, rollover, is_archived, created_at, updated_at
       FROM budgets WHERE user_id = ? AND is_archived = 1 ORDER BY category ASC`
    )
    .all(userId)
}
