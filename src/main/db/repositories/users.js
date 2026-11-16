import { DEFAULT_WALLET } from '../../../shared/wallets.js'

export function createUser(db, { username, passwordHash }) {
  const run = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(username, passwordHash)
    db.prepare(
      'INSERT INTO wallets (user_id, name, type, style, opening_balance, sort_order) VALUES (?, ?, ?, ?, 0, 0)'
    ).run(info.lastInsertRowid, DEFAULT_WALLET.name, DEFAULT_WALLET.type, DEFAULT_WALLET.style)
    return findById(db, info.lastInsertRowid)
  })
  return run()
}

export function findByUsername(db, username) {
  return (
    db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1').get(username) ?? null
  )
}

export function findById(db, id) {
  const row = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id)
  return row ?? null
}

export function exists(db, id) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE id = ?').get(id))
}

// Full row including password_hash - main-process auth only.
export function getRecordById(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) ?? null
}

export function updatePassword(db, id, passwordHash) {
  return (
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id).changes > 0
  )
}
