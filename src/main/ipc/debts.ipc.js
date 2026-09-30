import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as debtsRepo from '../db/repositories/debts.js'
import {
  validateAmount,
  validateDate,
  validateId,
  validateInt,
  validatePage,
  validatePaymentType,
  validateText
} from '../db/validate.js'
import { DEBT_PAYMENT_TYPE_VALUES, DEBT_STATUSES, RECEIPT_FILE_PATTERN } from '../../shared/constants.js'

function normalizeReceipt(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !RECEIPT_FILE_PATTERN.test(value)) {
    throw new Error('Invalid receipt reference')
  }
  return value
}

function normalize(payload) {
  const payment_type = validatePaymentType(
    payload.payment_type ?? 'no-schedule',
    DEBT_PAYMENT_TYPE_VALUES
  )
  let due_date = validateDate(payload.due_date, 'due_date', { required: false })
  let monthly_amount = null
  let payment_day = null
  let first_payment_date = null

  if (payment_type === 'fixed-date') {
    if (!due_date) throw new Error('A due date is required for fixed-date debts')
  }
  if (payment_type === 'monthly') {
    monthly_amount = validateAmount(payload.monthly_amount, 'monthly_amount')
    first_payment_date = validateDate(payload.first_payment_date, 'first_payment_date', {
      required: false
    })
    payment_day = payload.payment_day
      ? validateInt(payload.payment_day, 'payment_day', { min: 1, max: 31 })
      : first_payment_date
        ? Number(first_payment_date.slice(8, 10))
        : null
    if (!first_payment_date && !payment_day) {
      throw new Error('A first payment date is required for monthly debts')
    }
    due_date = null
  }

  return {
    creditor: validateText(payload.creditor, 'creditor', { required: true, max: 120 }),
    total_amount: validateAmount(payload.total_amount, 'total_amount'),
    due_date,
    payment_type,
    monthly_amount,
    payment_day,
    first_payment_date,
    receipt_path: normalizeReceipt(payload.receipt_path),
    notes: validateText(payload.notes, 'notes', { max: 500 })
  }
}

export function registerDebtsHandlers() {
  handle('debts:list', ({ userId, payload }) => {
    if (payload.status) validatePaymentType(payload.status, DEBT_STATUSES)
    return debtsRepo.list(getDatabase(), userId, {
      page: validatePage(payload.page),
      pageSize: payload.pageSize,
      search: payload.search ? String(payload.search).trim() : undefined,
      status: payload.status || undefined,
      order: payload.order
    })
  })

  handle('debts:get', ({ userId, payload }) => {
    const row = debtsRepo.getById(getDatabase(), userId, validateId(payload.id))
    if (!row) throw new Error('Debt not found')
    return row
  })

  handle('debts:create', ({ userId, payload }) =>
    debtsRepo.create(getDatabase(), userId, normalize(payload))
  )

  handle('debts:update', ({ userId, payload }) => {
    const row = debtsRepo.update(getDatabase(), userId, validateId(payload.id), normalize(payload))
    if (!row) throw new Error('Debt not found')
    return row
  })

  handle('debts:remove', ({ userId, payload }) => {
    const removed = debtsRepo.remove(getDatabase(), userId, validateId(payload.id))
    if (!removed) throw new Error('Debt not found')
    return { removed: true }
  })

  handle('debts:restore', ({ userId, payload }) => {
    const restored = debtsRepo.restore(getDatabase(), userId, validateId(payload.id))
    if (!restored) throw new Error('Archived debt not found')
    return { restored: true }
  })

  handle('debts:archived', ({ userId }) => debtsRepo.listArchived(getDatabase(), userId))

  handle('debts:payments', ({ userId, payload }) => {
    const rows = debtsRepo.listPayments(getDatabase(), userId, validateId(payload.debtId, 'debtId'))
    if (rows === null) throw new Error('Debt not found')
    return rows
  })

  handle('debts:addPayment', ({ userId, payload }) => {
    const row = debtsRepo.addPayment(
      getDatabase(),
      userId,
      validateId(payload.debtId, 'debtId'),
      {
        amount: validateAmount(payload.amount, 'amount'),
        date: validateDate(payload.date, 'date'),
        notes: validateText(payload.notes, 'notes', { max: 500 }),
        installment_due: payload.installment_due
          ? validateDate(payload.installment_due, 'installment_due')
          : null,
        receipt_path: normalizeReceipt(payload.receipt_path)
      }
    )
    if (!row) throw new Error('Debt not found')
    return row
  })

  handle('debts:removePayment', ({ userId, payload }) => {
    const row = debtsRepo.removePayment(getDatabase(), userId, validateId(payload.paymentId, 'paymentId'))
    if (!row) throw new Error('Payment not found')
    return row
  })
}
