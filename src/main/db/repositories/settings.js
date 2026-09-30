import { DEFAULT_CURRENCY } from '../../../shared/currency.js'
import { DEFAULT_LEAD_DAYS } from '../../../shared/reminders.js'

const COLUMNS =
  'user_id, currency, require_password_on_start, reminders_enabled, reminder_lead_days, updated_at'

export function getSettings(db, userId) {
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM user_settings WHERE user_id = ?`)
    .get(userId)
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
}

export function upsertSettings(
  db,
  userId,
  { currency, requirePasswordOnStart, remindersEnabled, reminderLeadDays } = {}
) {
  const current = getSettings(db, userId)
  const nextCurrency = currency ?? current.currency
  const nextRequire =
    requirePasswordOnStart === undefined ? current.requirePasswordOnStart : requirePasswordOnStart
  const nextReminders =
    remindersEnabled === undefined ? current.remindersEnabled : remindersEnabled
  const nextLead = reminderLeadDays ?? current.reminderLeadDays

  db.prepare(
    `INSERT INTO user_settings
       (user_id, currency, require_password_on_start, reminders_enabled, reminder_lead_days, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id)
     DO UPDATE SET currency = excluded.currency,
                   require_password_on_start = excluded.require_password_on_start,
                   reminders_enabled = excluded.reminders_enabled,
                   reminder_lead_days = excluded.reminder_lead_days,
                   updated_at = CURRENT_TIMESTAMP`
  ).run(userId, nextCurrency, nextRequire ? 1 : 0, nextReminders ? 1 : 0, nextLead)

  return getSettings(db, userId)
}

export function deleteSettings(db, userId) {
  return db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId).changes > 0
}
