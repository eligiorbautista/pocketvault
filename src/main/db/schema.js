import { MIGRATIONS, SCHEMA_VERSION } from '../../shared/schema.js'

export { MIGRATIONS, SCHEMA_VERSION }

function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

// better-sqlite3 migration runner. The DDL itself lives in src/shared/schema.js
// so the Capacitor (Android) build runs the exact same statements.
export function applyMigrations(db) {
  const current = db.pragma('user_version', { simple: true })
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const migrate = db.transaction(() => {
      for (const statement of splitStatements(MIGRATIONS[version])) {
        try {
          db.exec(statement)
        } catch (error) {
          // ALTER TABLE ADD COLUMN is not idempotent - ignore re-adds.
          if (/duplicate column name/i.test(String(error?.message))) continue
          throw error
        }
      }
      db.pragma(`user_version = ${version + 1}`)
    })
    migrate()
  }
}
