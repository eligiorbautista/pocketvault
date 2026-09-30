import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as settingsRepo from '../db/repositories/settings.js'
import { isValidCurrency } from '../../shared/currency.js'
import { MAX_LEAD_DAYS } from '../../shared/reminders.js'
import { validateInt } from '../db/validate.js'

export function registerSettingsHandlers() {
  handle('settings:get', ({ userId }) => settingsRepo.getSettings(getDatabase(), userId))

  handle('settings:update', ({ userId, payload }) => {
    const patch = {}
    if (payload.currency !== undefined) {
      if (!isValidCurrency(payload.currency)) throw new Error('Unsupported currency')
      patch.currency = payload.currency
    }
    if (payload.requirePasswordOnStart !== undefined) {
      patch.requirePasswordOnStart = Boolean(payload.requirePasswordOnStart)
    }
    if (payload.remindersEnabled !== undefined) {
      patch.remindersEnabled = Boolean(payload.remindersEnabled)
    }
    if (payload.reminderLeadDays !== undefined) {
      patch.reminderLeadDays = validateInt(payload.reminderLeadDays, 'reminderLeadDays', {
        min: 0,
        max: MAX_LEAD_DAYS
      })
    }
    return settingsRepo.upsertSettings(getDatabase(), userId, patch)
  })
}
