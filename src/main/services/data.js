import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { RECEIPT_FILE_PATTERN } from '../../shared/constants.js'

// Permanently deletes all of a user's records and receipts, but keeps the
// user account itself (login stays valid).
export function deleteUserData(db, userId, receiptsDir) {
  const receiptPaths = [
    ...db
      .prepare("SELECT receipt_path FROM income WHERE user_id = ? AND receipt_path IS NOT NULL")
      .all(userId),
    ...db
      .prepare("SELECT receipt_path FROM debts WHERE user_id = ? AND receipt_path IS NOT NULL")
      .all(userId),
    ...db
      .prepare(
        `SELECT p.receipt_path FROM debt_payments p
         JOIN debts d ON d.id = p.debt_id
         WHERE d.user_id = ? AND p.receipt_path IS NOT NULL`
      )
      .all(userId)
  ].map((row) => row.receipt_path)

  const counts = {}
  const run = db.transaction(() => {
    counts.debtPayments = db
      .prepare('DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE user_id = ?)')
      .run(userId).changes
    counts.debts = db.prepare('DELETE FROM debts WHERE user_id = ?').run(userId).changes
    counts.savingsContributions = db
      .prepare(
        'DELETE FROM savings_contributions WHERE goal_id IN (SELECT id FROM savings_goals WHERE user_id = ?)'
      )
      .run(userId).changes
    counts.savingsGoals = db.prepare('DELETE FROM savings_goals WHERE user_id = ?').run(userId).changes
    counts.income = db.prepare('DELETE FROM income WHERE user_id = ?').run(userId).changes
    counts.expenses = db.prepare('DELETE FROM expenses WHERE user_id = ?').run(userId).changes
    counts.budgets = db.prepare('DELETE FROM budgets WHERE user_id = ?').run(userId).changes
  })
  run()

  let receipts = 0
  for (const name of receiptPaths) {
    if (!name || !RECEIPT_FILE_PATTERN.test(name)) continue
    const full = join(receiptsDir, name)
    if (existsSync(full)) {
      unlinkSync(full)
      receipts += 1
    }
  }
  counts.receipts = receipts

  return counts
}
