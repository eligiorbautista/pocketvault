import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as expensesRepo from '../db/repositories/expenses.js'
import {
  validateAmount,
  validateCategory,
  validateDate,
  validateId,
  validatePage,
  validateText
} from '../db/validate.js'

function normalize(payload) {
  return {
    category: validateCategory(payload.category),
    amount: validateAmount(payload.amount, 'amount'),
    date: validateDate(payload.date, 'date'),
    notes: validateText(payload.notes, 'notes', { max: 500 })
  }
}

export function registerExpensesHandlers() {
  handle('expenses:list', ({ userId, payload }) =>
    expensesRepo.list(getDatabase(), userId, {
      page: validatePage(payload.page),
      pageSize: payload.pageSize,
      category: payload.category ? validateCategory(payload.category) : undefined,
      search: payload.search ? String(payload.search).trim() : undefined,
      from: payload.from || undefined,
      to: payload.to || undefined,
      order: payload.order
    })
  )

  handle('expenses:get', ({ userId, payload }) => {
    const row = expensesRepo.getById(getDatabase(), userId, validateId(payload.id))
    if (!row) throw new Error('Expense record not found')
    return row
  })

  handle('expenses:create', ({ userId, payload }) =>
    expensesRepo.create(getDatabase(), userId, normalize(payload))
  )

  handle('expenses:update', ({ userId, payload }) => {
    const row = expensesRepo.update(
      getDatabase(),
      userId,
      validateId(payload.id),
      normalize(payload)
    )
    if (!row) throw new Error('Expense record not found')
    return row
  })

  handle('expenses:remove', ({ userId, payload }) => {
    const removed = expensesRepo.remove(getDatabase(), userId, validateId(payload.id))
    if (!removed) throw new Error('Expense record not found')
    return { removed: true }
  })

  handle('expenses:restore', ({ userId, payload }) => {
    const restored = expensesRepo.restore(getDatabase(), userId, validateId(payload.id))
    if (!restored) throw new Error('Archived expense record not found')
    return { restored: true }
  })

  handle('expenses:archived', ({ userId }) => expensesRepo.listArchived(getDatabase(), userId))

  handle('expenses:categories', ({ userId }) => expensesRepo.distinctCategories(getDatabase(), userId))
}
