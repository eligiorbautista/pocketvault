import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { MIGRATIONS } from '@shared/schema.js'

const DATABASE = 'pocketvault'
const sqlite = new SQLiteConnection(CapacitorSQLite)

let databasePromise = null
// Tracks whether we are inside an explicit transaction() so inner writes know
// not to let the plugin open a nested transaction of its own.
let txDepth = 0

async function migrate(db) {
  let current = 0
  try {
    const result = await db.query('PRAGMA user_version;')
    current = Number(result.values?.[0]?.user_version ?? 0)
  } catch {
    current = 0
  }
  // Most statements are idempotent (CREATE ... IF NOT EXISTS). ALTER TABLE ADD
  // COLUMN is not, so we run statement-by-statement and tolerate the
  // "duplicate column name" error (hit when the version probe fails and all
  // migrations are re-applied).
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const statements = MIGRATIONS[version]
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
    for (const statement of statements) {
      try {
        await db.execute(`${statement};`)
      } catch (error) {
        if (/duplicate column name/i.test(String(error?.message))) continue
        throw error
      }
    }
  }
  try {
    await db.execute(`PRAGMA user_version = ${MIGRATIONS.length};`)
  } catch {
    // best effort
  }
}

async function openDatabase() {
  let consistency = { result: false }
  try {
    consistency = await sqlite.checkConnectionsConsistency()
  } catch {
    consistency = { result: false }
  }
  const isConnection = (await sqlite.isConnection(DATABASE, false)).result
  const db =
    consistency.result && isConnection
      ? await sqlite.retrieveConnection(DATABASE, false)
      : await sqlite.createConnection(DATABASE, false, 'no-encryption', 1, false)
  await db.open()
  await db.execute('PRAGMA foreign_keys = ON;')
  await migrate(db)
  return db
}

export function getDatabase() {
  if (!databasePromise) {
    // Don't cache a rejected promise: a transient failure (plugin not ready,
    // consistency check) should be retryable on the next call.
    databasePromise = openDatabase().catch((error) => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}

export async function query(sql, params = []) {
  const db = await getDatabase()
  const result = await db.query(sql, params)
  return result.values ?? []
}

export async function getOne(sql, params = []) {
  const rows = await query(sql, params)
  return rows[0] ?? null
}

export async function run(sql, params = [], transactional) {
  const db = await getDatabase()
  // Inside our explicit transaction() we must NOT let the plugin start its own
  // (it throws "Already in transaction"); default the flag accordingly.
  const useTransaction = transactional ?? !txDepth
  const result = await db.run(sql, params, useTransaction)
  return {
    changes: result.changes?.changes ?? 0,
    lastId: result.changes?.lastId ?? null
  }
}

// Executes several statements atomically.
export async function executeSet(statements, transactional) {
  const db = await getDatabase()
  const useTransaction = transactional ?? txDepth === 0
  return db.executeSet(statements, useTransaction)
}

// Runs `fn` inside a single DB transaction. If `fn` throws (or rejects), the
// whole transaction is rolled back, so a multi-step write is all-or-nothing.
export async function transaction(fn) {
  const db = await getDatabase()
  await db.beginTransaction()
  txDepth += 1
  try {
    const result = await fn()
    await db.commitTransaction()
    return result
  } catch (error) {
    try {
      await db.rollbackTransaction()
    } catch {
      // ignore rollback failure — surface the original error
    }
    throw error
  } finally {
    txDepth -= 1
  }
}

export async function paginate({
  select,
  from,
  where = [],
  params = [],
  orderBy = 'id DESC',
  page = 1,
  pageSize = 50
}) {
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const totalRow = await getOne(`SELECT COUNT(*) AS c FROM ${from} ${whereSql}`, params)
  const total = totalRow?.c ?? 0
  const offset = (page - 1) * pageSize
  const rows = await query(
    `${select} FROM ${from} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  )
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  }
}
