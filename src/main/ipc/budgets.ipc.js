import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as budgetsRepo from '../db/repositories/budgets.js'
import { validateAmount, validateCategory, validateId } from '../db/validate.js'

function validateMonth(value) {
  const month = String(value ?? '')
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be in YYYY-MM format')
  const [, m] = month.split('-').map(Number)
  if (m < 1 || m > 12) throw new Error('month must be in YYYY-MM format')
  return month
}

export function registerBudgetsHandlers() {
  handle('budgets:list', ({ userId, payload }) =>
    budgetsRepo.listMonthly(getDatabase(), userId, validateMonth(payload.month))
  )

  handle('budgets:upsert', ({ userId, payload }) =>
    budgetsRepo.upsert(getDatabase(), userId, {
      category: validateCategory(payload.category),
      monthly_limit: validateAmount(payload.monthly_limit, 'monthly_limit')
    })
  )

  handle('budgets:remove', ({ userId, payload }) => {
    const removed = budgetsRepo.remove(getDatabase(), userId, validateId(payload.id))
    if (!removed) throw new Error('Budget not found')
    return { removed: true }
  })
}
