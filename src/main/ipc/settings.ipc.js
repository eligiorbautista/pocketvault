import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as settingsRepo from '../db/repositories/settings.js'
import { isValidCurrency } from '../../shared/currency.js'

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
    return settingsRepo.upsertSettings(getDatabase(), userId, patch)
  })
}
