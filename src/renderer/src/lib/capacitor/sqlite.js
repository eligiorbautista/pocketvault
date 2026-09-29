import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { MIGRATIONS } from '@shared/schema.js'

const DATABASE = 'pocketvault'
const sqlite = new SQLiteConnection(CapacitorSQLite)

let databasePromise = null

async function migrate(db) {
  let current = 0
  try {
    const result = await db.query('PRAGMA user_version;')
    current = Number(result.values?.[0]?.user_version ?? 0)
  } catch {
    current = 0
  }
  // Every statement is idempotent (CREATE ... IF NOT EXISTS), so even if the
  // version probe fails we simply re-run the migrations.
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    await db.execute(MIGRATIONS[version])
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
  if (!databasePromise) databasePromise = openDatabase()
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

export async function run(sql, params = []) {
  const db = await getDatabase()
  const result = await db.run(sql, params)
  return {
    changes: result.changes?.changes ?? 0,
    lastId: result.changes?.lastId ?? null
  }
}

// Executes several statements atomically.
export async function executeSet(statements) {
  const db = await getDatabase()
  return db.executeSet(statements, true)
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
