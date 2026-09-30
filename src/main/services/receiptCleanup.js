import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { RECEIPT_FILE_PATTERN } from '../../shared/constants.js'

// Removes receipt files that are not referenced by any income, debt or payment
// record. Runs at startup so abandoned uploads (cancelled forms, crashes) do
// not accumulate. Electron-free so it can be unit tested.
export function reconcileReceipts(db, dir) {
  if (!dir || !existsSync(dir)) return 0
  const referenced = new Set()
  const collect = (sql) => {
    for (const row of db.prepare(sql).all()) {
      if (row.receipt_path) referenced.add(row.receipt_path)
    }
  }
  collect('SELECT receipt_path FROM income WHERE receipt_path IS NOT NULL')
  collect('SELECT receipt_path FROM debts WHERE receipt_path IS NOT NULL')
  collect('SELECT receipt_path FROM debt_payments WHERE receipt_path IS NOT NULL')
  let removed = 0
  for (const name of readdirSync(dir)) {
    if (!RECEIPT_FILE_PATTERN.test(name) || referenced.has(name)) continue
    try {
      unlinkSync(join(dir, name))
      removed += 1
    } catch {
      // best-effort cleanup
    }
  }
  return removed
}
