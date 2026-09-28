import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { applyMigrations } from './schema.js'

let current = null
let currentPath = null

export function createDatabase(dbPath) {
  if (current) return current
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applyMigrations(db)
  current = db
  currentPath = dbPath
  return db
}

export function getDatabase() {
  if (!current) throw new Error('Database has not been initialized')
  return current
}

export function getDatabasePath() {
  return currentPath
}

export function closeDatabase() {
  if (!current) return
  checkpointDatabase()
  current.close()
  current = null
}

export function checkpointDatabase() {
  if (!current) return
  try {
    current.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // checkpoint is best-effort; ignore failures during shutdown/backup
  }
}
