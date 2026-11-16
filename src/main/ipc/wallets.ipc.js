import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as walletsRepo from '../db/repositories/wallets.js'
import { validateId } from '../db/validate.js'
import { validateWalletId } from '../../shared/wallets.js'

export function registerWalletsHandlers() {
  handle('wallets:list', ({ userId }) => walletsRepo.list(getDatabase(), userId))

  handle('wallets:get', ({ userId, payload }) => {
    const row = walletsRepo.getById(getDatabase(), userId, validateId(payload.id))
    if (!row) throw new Error('Wallet not found')
    return row
  })

  handle('wallets:create', ({ userId, payload }) =>
    walletsRepo.create(getDatabase(), userId, payload)
  )

  handle('wallets:update', ({ userId, payload }) => {
    const row = walletsRepo.update(
      getDatabase(),
      userId,
      validateId(payload.id),
      payload
    )
    if (!row) throw new Error('Wallet not found')
    return row
  })

  handle('wallets:remove', ({ userId, payload }) => {
    const removed = walletsRepo.remove(getDatabase(), userId, validateId(payload.id))
    if (!removed) throw new Error('Wallet not found')
    return { removed: true }
  })

  handle('wallets:restore', ({ userId, payload }) => {
    const restored = walletsRepo.restore(getDatabase(), userId, validateId(payload.id))
    if (!restored) throw new Error('Archived wallet not found')
    return { restored: true }
  })

  handle('wallets:archived', ({ userId }) => walletsRepo.listArchived(getDatabase(), userId))

  handle('wallets:move', ({ userId, payload }) => ({
    moved: walletsRepo.move(
      getDatabase(),
      userId,
      validateId(payload.id),
      String(payload.direction ?? '')
    )
  }))

  handle('wallets:summary', ({ userId }) => walletsRepo.summary(getDatabase(), userId))

  handle('wallets:activity', ({ userId, payload }) => {
    const walletId = validateWalletId(payload.walletId)
    const limit = Math.min(500, Math.max(1, Number(payload.limit) || 100))
    return walletsRepo.activity(getDatabase(), userId, walletId, limit)
  })

  handle('wallets:transfer', ({ userId, payload }) =>
    walletsRepo.transfer(getDatabase(), userId, payload)
  )

  handle('wallets:removeTransfer', ({ userId, payload }) => {
    const removed = walletsRepo.removeTransfer(getDatabase(), userId, validateId(payload.id))
    if (!removed) throw new Error('Transfer not found')
    return { removed: true }
  })

  handle('wallets:restoreTransfer', ({ userId, payload }) => {
    const restored = walletsRepo.restoreTransfer(getDatabase(), userId, validateId(payload.id))
    if (!restored) throw new Error('Archived transfer not found')
    return { restored: true }
  })

  handle('wallets:archivedTransfers', ({ userId }) =>
    walletsRepo.listArchivedTransfers(getDatabase(), userId)
  )
}
