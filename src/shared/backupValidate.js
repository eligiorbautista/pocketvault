// Shared validation for backup payloads, used by BOTH the desktop importer
// (src/main/services/backup.js) and the Capacitor adapter so a malformed or
// hand-edited backup is rejected instead of silently writing bad rows (the
// old behaviour coerced non-numeric amounts to 0).
import {
  DEBT_PAYMENT_KINDS,
  DEBT_PAYMENT_TYPE_VALUES,
  DEBT_STATUSES,
  INCOME_SOURCE_IMPORT_MAX_LEN,
  RECEIPT_FILE_PATTERN
} from './constants.js'
import {
  assert,
  validateAmount,
  validateCategory,
  validateDate,
  validateId,
  validateInt,
  validateText
} from './validate.js'
import { validateTransferInput, validateWalletInput } from './wallets.js'
import { RECURRING_FREQUENCIES, RECURRING_KINDS } from './recurring.js'

function receiptOf(value, field) {
  if (value === undefined || value === null || value === '') return null
  assert(typeof value === 'string' && RECEIPT_FILE_PATTERN.test(value), `${field} is invalid`)
  return value
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

// Throws a ValidationError on the first invalid row. Returns nothing.
export function validateBackupData(data) {
  for (const row of asArray(data.wallets)) {
    if (row.id != null) validateId(row.id, 'wallet id')
    validateWalletInput(row)
    if (row.sort_order !== undefined && row.sort_order !== null) {
      validateInt(row.sort_order, 'wallet sort order', { min: 0, max: 1_000_000 })
    }
  }

  for (const row of asArray(data.wallet_transfers)) {
    if (row.id != null) validateId(row.id, 'transfer id')
    validateTransferInput(row)
    validateId(row.from_wallet_id, 'from_wallet_id')
    validateId(row.to_wallet_id, 'to_wallet_id')
  }

  for (const row of asArray(data.income)) {
    if (row.wallet_id != null) validateId(row.wallet_id, 'income wallet')
    validateAmount(row.amount, 'income amount')
    validateDate(row.date, 'income date')
    validateText(row.source, 'income source', { max: INCOME_SOURCE_IMPORT_MAX_LEN })
    validateText(row.notes, 'income notes', { max: 500 })
    receiptOf(row.receipt_path, 'income receipt')
  }

  for (const row of asArray(data.expenses)) {
    if (row.wallet_id != null) validateId(row.wallet_id, 'expense wallet')
    validateCategory(row.category)
    validateAmount(row.amount, 'expense amount')
    validateDate(row.date, 'expense date')
    validateText(row.notes, 'expense notes', { max: 500 })
  }

  for (const row of asArray(data.debts)) {
    if (row.wallet_id != null) validateId(row.wallet_id, 'debt wallet')
    validateText(row.creditor, 'creditor', { required: true, max: 120 })
    validateAmount(row.total_amount, 'total amount')
    validateAmount(row.paid_amount, 'paid amount', { allowZero: true })
    validateAmount(row.remaining_amount, 'remaining amount', { allowZero: true })
    validateDate(row.due_date, 'due date', { required: false })
    assert(
      row.payment_type === undefined ||
        DEBT_PAYMENT_TYPE_VALUES.includes(row.payment_type),
      'debt payment type is invalid'
    )
    if (row.monthly_amount !== undefined && row.monthly_amount !== null) {
      validateAmount(row.monthly_amount, 'monthly amount')
    }
    if (row.payment_day !== undefined && row.payment_day !== null) {
      validateInt(row.payment_day, 'payment day', { min: 1, max: 31 })
    }
    validateDate(row.first_payment_date, 'first payment date', { required: false })
    receiptOf(row.receipt_path, 'debt receipt')
    assert(row.status === undefined || DEBT_STATUSES.includes(row.status), 'debt status is invalid')
    validateText(row.notes, 'debt notes', { max: 500 })
  }

  for (const row of asArray(data.debt_payments)) {
    if (row.wallet_id != null) validateId(row.wallet_id, 'payment wallet')
    validateAmount(row.amount, 'payment amount')
    validateDate(row.date, 'payment date')
    assert(
      row.payment_type === undefined || DEBT_PAYMENT_KINDS.includes(row.payment_type),
      'payment type is invalid'
    )
    validateDate(row.installment_due, 'installment due', { required: false })
    receiptOf(row.receipt_path, 'payment receipt')
    validateText(row.notes, 'payment notes', { max: 500 })
  }

  for (const row of asArray(data.budgets)) {
    validateCategory(row.category)
    validateAmount(row.monthly_limit, 'budget limit', { allowZero: true })
  }

  for (const row of asArray(data.savings_goals)) {
    validateText(row.goal_name, 'goal name', { required: true, max: 120 })
    validateAmount(row.target_amount, 'target amount')
    validateAmount(row.current_amount, 'current amount', { allowZero: true })
    validateDate(row.deadline, 'deadline', { required: false })
    if (row.wallet_id != null) validateId(row.wallet_id, 'goal wallet')
    assert(row.kind === undefined || row.kind === 'goal' || row.kind === 'sinking', 'goal kind is invalid')
  }

  for (const row of asArray(data.recurring_rules)) {
    validateText(row.name, 'recurring name', { required: true, max: 120 })
    assert(RECURRING_KINDS.includes(row.kind), 'recurring kind is invalid')
    assert(RECURRING_FREQUENCIES.includes(row.frequency), 'recurring frequency is invalid')
    validateId(row.wallet_id, 'recurring wallet')
    validateAmount(row.amount, 'recurring amount')
    validateDate(row.next_due, 'recurring next due')
    if (row.reminder_days !== undefined && row.reminder_days !== null) {
      validateInt(row.reminder_days, 'recurring reminder days', { min: 0, max: 30 })
    }
    if (row.kind !== 'income') validateCategory(row.category)
  }

  for (const row of asArray(data.savings_contributions)) {
    validateAmount(row.amount, 'contribution amount')
    validateDate(row.date, 'contribution date')
    validateText(row.notes, 'contribution notes', { max: 500 })
  }
}

// Row counts as they would be reported after import.
export function backupRowCounts(data) {
  return {
    income: asArray(data.income).length,
    expenses: asArray(data.expenses).length,
    debts: asArray(data.debts).length,
    debtPayments: asArray(data.debt_payments).length,
    budgets: asArray(data.budgets).length,
    savingsGoals: asArray(data.savings_goals).length,
    savingsContributions: asArray(data.savings_contributions).length,
    wallets: asArray(data.wallets).length,
    walletTransfers: asArray(data.wallet_transfers).length,
    recurringRules: asArray(data.recurring_rules).length
  }
}

// Rejects a backup whose manifest counts disagree with the actual payload
// (a sign of truncation or tampering).
export function verifyBackupCounts(manifest, data, receiptCount) {
  const counts = manifest?.counts
  if (!counts || typeof counts !== 'object') return
  const actual = backupRowCounts(data)
  for (const [key, value] of Object.entries(actual)) {
    if (counts[key] !== undefined && counts[key] !== value) {
      throw new Error('Invalid backup: the manifest counts do not match the data')
    }
  }
  if (counts.receipts !== undefined && counts.receipts !== receiptCount) {
    throw new Error('Invalid backup: the manifest counts do not match the receipts')
  }
}
