import * as walletsRepo from './wallets.js'

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Upserts once per local calendar day, so opening the app repeatedly does not
// create duplicate snapshots.
export function capture(db, userId) {
  const summary = walletsRepo.summary(db, userId)
  const date = today()
  db.prepare(
    `INSERT INTO net_worth_snapshots (user_id, date, assets, liabilities, net_worth)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET
       assets = excluded.assets,
       liabilities = excluded.liabilities,
       net_worth = excluded.net_worth`
  ).run(userId, date, summary.netBalance, summary.liabilities, summary.netWorth)
  return db
    .prepare(
      'SELECT id, user_id, date, assets, liabilities, net_worth, created_at FROM net_worth_snapshots WHERE user_id = ? AND date = ?'
    )
    .get(userId, date)
}

export function list(db, userId, limit = 90) {
  return db
    .prepare(
      `SELECT id, user_id, date, assets, liabilities, net_worth, created_at
       FROM net_worth_snapshots WHERE user_id = ? ORDER BY date DESC LIMIT ?`
    )
    .all(userId, Math.min(Math.max(Number(limit) || 90, 1), 365))
    .reverse()
}
