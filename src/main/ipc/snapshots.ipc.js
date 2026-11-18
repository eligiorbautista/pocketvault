import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as snapshotsRepo from '../db/repositories/snapshots.js'
import { validateInt } from '../db/validate.js'

export function registerSnapshotsHandlers() {
  handle('snapshots:capture', ({ userId }) => snapshotsRepo.capture(getDatabase(), userId))

  handle('snapshots:list', ({ userId, payload }) =>
    snapshotsRepo.list(
      getDatabase(),
      userId,
      payload?.limit === undefined ? 90 : validateInt(payload.limit, 'limit', { min: 1, max: 365 })
    )
  )
}
