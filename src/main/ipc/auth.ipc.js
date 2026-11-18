import bcrypt from 'bcryptjs'
import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as users from '../db/repositories/users.js'
import { clearAppLock, getAppLock, getSettings, setAppLock } from '../db/repositories/settings.js'
import { clearSession, getSessionUserId, setSession } from '../db/session.js'
import { validateId, validatePassword, validateUsername } from '../db/validate.js'

// Light in-memory throttling for the pre-auth endpoints. bcrypt already makes
// each attempt slow; this stops scripted brute force without any state on disk.
const ATTEMPTS = new Map()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 60_000
// Sessions that have a valid saved user but are waiting for the local PIN.
const LOCKED = new Map()

function throttleKey(prefix, value) {
  return `${prefix}:${String(value ?? '').toLowerCase()}`
}

function assertNotThrottled(key) {
  const now = Date.now()
  const recent = (ATTEMPTS.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_ATTEMPTS) {
    throw new Error('Too many attempts. Please wait a moment and try again.')
  }
  ATTEMPTS.set(key, recent)
}

function recordFailure(key) {
  const now = Date.now()
  const recent = (ATTEMPTS.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.push(now)
  ATTEMPTS.set(key, recent)
}

function recordSuccess(key) {
  ATTEMPTS.delete(key)
}

// auth:restore used to accept any renderer-supplied user id, so the
// "require password on start" preference could be bypassed by editing
// localStorage. The gate now lives in the main process.
function requirePasswordOnStart(db, userId) {
  return Boolean(getSettings(db, userId).requirePasswordOnStart)
}

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
      const key = throttleKey('login', username)
      assertNotThrottled(key)
      const record = users.findByUsername(db, username)
      if (!record || !bcrypt.compareSync(password, record.password_hash)) {
        recordFailure(key)
        throw new Error('Invalid username or password')
      }
      recordSuccess(key)
      LOCKED.delete(event.sender.id)
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
      const lock = getAppLock(db, userId)
      if (lock.enabled) {
        clearSession(event.sender.id)
        LOCKED.set(event.sender.id, userId)
        const user = users.findById(db, userId)
        return { user: { id: user.id, username: user.username }, locked: true }
      }
      // If the user requires a password on start, a plain stored id is not
      // enough — force an interactive login instead of resuming silently.
      if (requirePasswordOnStart(db, userId)) {
        clearSession(event.sender.id)
        const error = new Error('Password required')
        error.code = 'PASSWORD_REQUIRED'
        throw error
      }
      setSession(event.sender.id, userId)
      const user = users.findById(db, userId)
      return { user: { id: user.id, username: user.username } }
    },
    { auth: false }
  )

  handle(
    'auth:unlock',
    ({ event }) => {
      const db = getDatabase()
      const userId = LOCKED.get(event.sender.id)
      if (!userId) throw new Error('Session expired. Sign in again.')
      LOCKED.delete(event.sender.id)
      setSession(event.sender.id, userId)
      const user = users.findById(db, userId)
      return { user: { id: user.id, username: user.username } }
    },
    { auth: false }
  )

  handle('auth:setAppLock', ({ userId, payload }) => {
    const db = getDatabase()
    const record = users.getRecordById(db, userId)
    if (!record) throw new Error('Account not found')
    if (!bcrypt.compareSync(String(payload.password ?? ''), record.password_hash)) {
      throw new Error('Current password is incorrect')
    }
    setAppLock(db, userId)
    return { enabled: true }
  })

  handle('auth:disableAppLock', ({ userId, payload }) => {
    const db = getDatabase()
    const record = users.getRecordById(db, userId)
    if (!record) throw new Error('Account not found')
    if (!bcrypt.compareSync(String(payload.password ?? ''), record.password_hash)) {
      throw new Error('Current password is incorrect')
    }
    clearAppLock(db, userId)
    return { enabled: false }
  })

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
      LOCKED.delete(event.sender.id)
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
    const nextPassword = validatePassword(newPassword, 'newPassword')

    users.updatePassword(db, userId, bcrypt.hashSync(nextPassword, 10))
    return true
  })
}
