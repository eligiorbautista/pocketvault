import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as savingsRepo from '../db/repositories/savings.js'
import {
  validateAmount,
  validateDate,
  validateId,
  validateText
} from '../db/validate.js'

function normalizeGoal(payload) {
  return {
    goal_name: validateText(payload.goal_name, 'goal_name', { required: true, max: 120 }),
    target_amount: validateAmount(payload.target_amount, 'target_amount'),
    deadline: validateDate(payload.deadline, 'deadline', { required: false })
  }
}

export function registerSavingsHandlers() {
  handle('savings:list', ({ userId }) => savingsRepo.list(getDatabase(), userId))

  handle('savings:get', ({ userId, payload }) => {
    const row = savingsRepo.getById(getDatabase(), userId, validateId(payload.id))
    if (!row) throw new Error('Savings goal not found')
    return row
  })

  handle('savings:create', ({ userId, payload }) =>
    savingsRepo.create(getDatabase(), userId, normalizeGoal(payload))
  )

  handle('savings:update', ({ userId, payload }) => {
    const row = savingsRepo.update(
      getDatabase(),
      userId,
      validateId(payload.id),
      normalizeGoal(payload)
    )
    if (!row) throw new Error('Savings goal not found')
    return row
  })

  handle('savings:remove', ({ userId, payload }) => {
    const removed = savingsRepo.remove(getDatabase(), userId, validateId(payload.id))
    if (!removed) throw new Error('Savings goal not found')
    return { removed: true }
  })

  handle('savings:contributions', ({ userId, payload }) => {
    const rows = savingsRepo.listContributions(
      getDatabase(),
      userId,
      validateId(payload.goalId, 'goalId')
    )
    if (rows === null) throw new Error('Savings goal not found')
    return rows
  })

  handle('savings:addContribution', ({ userId, payload }) => {
    const row = savingsRepo.addContribution(
      getDatabase(),
      userId,
      validateId(payload.goalId, 'goalId'),
      {
        amount: validateAmount(payload.amount, 'amount'),
        date: validateDate(payload.date, 'date'),
        income_id: payload.income_id ? validateId(payload.income_id, 'income_id') : null,
        notes: validateText(payload.notes, 'notes', { max: 500 })
      }
    )
    if (!row) throw new Error('Savings goal not found')
    return row
  })

  handle('savings:removeContribution', ({ userId, payload }) => {
    const row = savingsRepo.removeContribution(
      getDatabase(),
      userId,
      validateId(payload.contributionId, 'contributionId')
    )
    if (!row) throw new Error('Contribution not found')
    return row
  })
}
