import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as incomeRepo from '../db/repositories/income.js'
import {
  validateAmount,
  validateDate,
  validateId,
  validatePage,
  validateText
} from '../db/validate.js'
import { RECEIPT_FILE_PATTERN } from '../../shared/constants.js'

function normalizeReceipt(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !RECEIPT_FILE_PATTERN.test(value)) {
    throw new Error('Invalid receipt reference')
  }
  return value
}

function normalize(payload) {
  return {
    amount: validateAmount(payload.amount, 'amount'),
    date: validateDate(payload.date, 'date'),
    source: validateText(payload.source, 'source', { max: 80 }),
    notes: validateText(payload.notes, 'notes', { max: 500 }),
    receipt_path: normalizeReceipt(payload.receipt_path)
  }
}

export function registerIncomeHandlers() {
  handle('income:list', ({ userId, payload }) =>
    incomeRepo.list(getDatabase(), userId, {
      page: validatePage(payload.page),
      pageSize: payload.pageSize,
      search: payload.search ? String(payload.search).trim() : undefined,
      from: payload.from || undefined,
      to: payload.to || undefined,
      order: payload.order
    })
  )

  handle('income:get', ({ userId, payload }) => {
    const row = incomeRepo.getById(getDatabase(), userId, validateId(payload.id))
    if (!row) throw new Error('Income record not found')
    return row
  })

  handle('income:create', ({ userId, payload }) =>
    incomeRepo.create(getDatabase(), userId, normalize(payload))
  )

  handle('income:update', ({ userId, payload }) => {
    const row = incomeRepo.update(getDatabase(), userId, validateId(payload.id), normalize(payload))
    if (!row) throw new Error('Income record not found')
    return row
  })

  handle('income:remove', ({ userId, payload }) => {
    const removed = incomeRepo.remove(getDatabase(), userId, validateId(payload.id))
    if (!removed) throw new Error('Income record not found')
    return { removed: true }
  })

  handle('income:all', ({ userId, payload }) =>
    incomeRepo.listAll(getDatabase(), userId, {
      from: payload.from || undefined,
      to: payload.to || undefined
    })
  )
}
