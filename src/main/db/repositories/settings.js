import { DEFAULT_CURRENCY } from '../../../shared/currency.js'

export function getSettings(db, userId) {
  const row = db
    .prepare(
      'SELECT user_id, currency, require_password_on_start, updated_at FROM user_settings WHERE user_id = ?'
    )
    .get(userId)
  if (!row) return { currency: DEFAULT_CURRENCY, requirePasswordOnStart: false }
  return {
    currency: row.currency || DEFAULT_CURRENCY,
    requirePasswordOnStart: Boolean(row.require_password_on_start)
  }
}

export function upsertSettings(db, userId, { currency, requirePasswordOnStart } = {}) {
  const current = getSettings(db, userId)
  const nextCurrency = currency ?? current.currency
  const nextRequire =
    requirePasswordOnStart === undefined ? current.requirePasswordOnStart : requirePasswordOnStart

  db.prepare(
    `INSERT INTO user_settings (user_id, currency, require_password_on_start, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id)
     DO UPDATE SET currency = excluded.currency,
                   require_password_on_start = excluded.require_password_on_start,
                   updated_at = CURRENT_TIMESTAMP`
  ).run(userId, nextCurrency, nextRequire ? 1 : 0)

  return getSettings(db, userId)
}

export function deleteSettings(db, userId) {
  return db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId).changes > 0
}
