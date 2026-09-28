import bcrypt from 'bcryptjs'
import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as users from '../db/repositories/users.js'
import { deleteUserData } from '../services/data.js'
import { receiptsDir } from '../services/receipts.js'

export function registerDataHandlers() {
  // Deletes all of the signed-in user's records but keeps the account.
  // Requires the account password as confirmation.
  handle('account:deleteData', ({ userId, payload }) => {
    const db = getDatabase()
    const record = users.getRecordById(db, userId)
    if (!record) throw new Error('Account not found')

    const password = String(payload.password ?? '')
    if (!bcrypt.compareSync(password, record.password_hash)) {
      throw new Error('Password is incorrect')
    }

    const counts = deleteUserData(db, userId, receiptsDir())
    return { deleted: true, counts }
  })
}
