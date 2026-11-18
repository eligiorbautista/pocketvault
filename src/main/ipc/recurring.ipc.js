import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as recurringRepo from '../db/repositories/recurring.js'
import * as walletsRepo from '../db/repositories/wallets.js'
import { validateRecurringInput } from '../../shared/recurring.js'
import { validateId } from '../db/validate.js'

function normalize(db, userId, payload) {
  return validateRecurringInput(payload, { wallets: walletsRepo.list(db, userId) })
}

export function registerRecurringHandlers() {
  handle('recurring:list', ({ userId }) => recurringRepo.list(getDatabase(), userId))

  handle('recurring:create', ({ userId, payload }) => {
    const db = getDatabase()
    return recurringRepo.create(db, userId, normalize(db, userId, payload))
  })

  handle('recurring:update', ({ userId, payload }) => {
    const db = getDatabase()
    const row = recurringRepo.update(
      db,
      userId,
      validateId(payload.id),
      normalize(db, userId, payload)
    )
    if (!row) throw new Error('Recurring rule not found')
    return row
  })

  handle('recurring:remove', ({ userId, payload }) => {
    if (!recurringRepo.remove(getDatabase(), userId, validateId(payload.id))) {
      throw new Error('Recurring rule not found')
    }
    return { removed: true }
  })

  handle('recurring:restore', ({ userId, payload }) => {
    if (!recurringRepo.restore(getDatabase(), userId, validateId(payload.id))) {
      throw new Error('Archived recurring rule not found')
    }
    return { restored: true }
  })

  handle('recurring:archived', ({ userId }) => recurringRepo.listArchived(getDatabase(), userId))

  handle('recurring:post', ({ userId, payload }) => {
    const row = recurringRepo.post(getDatabase(), userId, validateId(payload.id))
    if (!row) throw new Error('Recurring rule not found')
    return row
  })

  handle('recurring:skip', ({ userId, payload }) => {
    const row = recurringRepo.skip(getDatabase(), userId, validateId(payload.id))
    if (!row) throw new Error('Recurring rule not found')
    return row
  })
}
