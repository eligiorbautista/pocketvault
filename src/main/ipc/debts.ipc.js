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
import { DEBT_PAYMENT_TYPE_VALUES, DEBT_STATUSES } from '../../shared/constants.js'

function normalize(payload) {
  const payment_type = validatePaymentType(
    payload.payment_type ?? 'no-schedule',
    DEBT_PAYMENT_TYPE_VALUES
  )
  let due_date = validateDate(payload.due_date, 'due_date', { required: false })
  let monthly_amount = null
  let payment_day = null

  if (payment_type === 'fixed-date') {
    if (!due_date) throw new Error('A due date is required for fixed-date debts')
  }
  if (payment_type === 'monthly') {
    monthly_amount = validateAmount(payload.monthly_amount, 'monthly_amount')
    payment_day = validateInt(payload.payment_day, 'payment_day', { min: 1, max: 31 })
    if (!due_date) due_date = null
  }

  return {
    creditor: validateText(payload.creditor, 'creditor', { required: true, max: 120 }),
    total_amount: validateAmount(payload.total_amount, 'total_amount'),
    due_date,
    payment_type,
    monthly_amount,
    payment_day,
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
        notes: validateText(payload.notes, 'notes', { max: 500 })
      }
    )
    if (!row) throw new Error('Debt not found')
    return row
  })

  handle('debts:reborrow', ({ userId, payload }) => {
    const row = debtsRepo.reborrow(
      getDatabase(),
      userId,
      validateId(payload.debtId, 'debtId'),
      {
        amount: validateAmount(payload.amount, 'amount'),
        date: validateDate(payload.date, 'date'),
        notes: validateText(payload.notes, 'notes', { max: 500 })
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
