import bcrypt from 'bcryptjs'
import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as users from '../db/repositories/users.js'
import { clearSession, getSessionUserId, setSession } from '../db/session.js'
import { validateId, validatePassword, validateUsername } from '../db/validate.js'

export function registerAuthHandlers() {
  handle(
    'auth:register',
    ({ event, payload }) => {
      const db = getDatabase()
      const username = validateUsername(payload.username)
      const password = validatePassword(payload.password)
      if (users.findByUsername(db, username)) throw new Error('Username is already taken')

      const passwordHash = bcrypt.hashSync(password, 10)
      const user = users.createUser(db, { username, passwordHash })
      setSession(event.sender.id, user.id)
      return { user: { id: user.id, username: user.username } }
    },
    { auth: false }
  )

  handle(
    'auth:login',
    ({ event, payload }) => {
      const db = getDatabase()
      const username = String(payload.username ?? '').trim()
      const password = String(payload.password ?? '')
      const record = users.findByUsername(db, username)
      if (!record || !bcrypt.compareSync(password, record.password_hash)) {
        throw new Error('Invalid username or password')
      }
      setSession(event.sender.id, record.id)
      return { user: { id: record.id, username: record.username } }
    },
    { auth: false }
  )

  handle(
    'auth:restore',
    ({ event, payload }) => {
      const db = getDatabase()
      const userId = validateId(payload.userId, 'userId')
      if (!users.exists(db, userId)) throw new Error('Saved session user no longer exists')
      setSession(event.sender.id, userId)
      const user = users.findById(db, userId)
      return { user: { id: user.id, username: user.username } }
    },
    { auth: false }
  )

  handle(
    'auth:current',
    ({ event }) => {
      const db = getDatabase()
      const userId = getSessionUserId(event.sender.id)
      if (!userId) return { user: null }
      const user = users.findById(db, userId)
      return { user: user ? { id: user.id, username: user.username } : null }
    },
    { auth: false }
  )

  handle(
    'auth:logout',
    ({ event }) => {
      clearSession(event.sender.id)
      return true
    },
    { auth: false }
  )

  handle('auth:changePassword', ({ userId, payload }) => {
    const db = getDatabase()
    const record = users.getRecordById(db, userId)
    if (!record) throw new Error('Account not found')

    const currentPassword = String(payload.currentPassword ?? '')
    const newPassword = String(payload.newPassword ?? '')

    if (!bcrypt.compareSync(currentPassword, record.password_hash)) {
      throw new Error('Current password is incorrect')
    }
    if (!newPassword) throw new Error('New password is required')

    users.updatePassword(db, userId, bcrypt.hashSync(newPassword, 10))
    return true
  })
}
