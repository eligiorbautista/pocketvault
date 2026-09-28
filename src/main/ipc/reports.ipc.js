import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as dashboardRepo from '../db/repositories/dashboard.js'
import * as reportsRepo from '../db/repositories/reports.js'
import { currentMonth, monthRange } from '../db/repositories/helpers.js'
import { validateDate } from '../db/validate.js'

function validateMonth(value) {
  const month = String(value ?? currentMonth())
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be in YYYY-MM format')
  return month
}

function validateYear(value) {
  const year = String(value ?? new Date().getFullYear())
  if (!/^\d{4}$/.test(year)) throw new Error('year must be a 4-digit year')
  return year
}

export function registerReportsHandlers() {
  handle('reports:dashboard', ({ userId, payload }) =>
    dashboardRepo.getSummary(getDatabase(), userId, validateMonth(payload.month))
  )

  handle('reports:monthlyTotals', ({ userId, payload }) =>
    reportsRepo.monthlyTotals(getDatabase(), userId, validateYear(payload.year))
  )

  handle('reports:rangeTotals', ({ userId, payload }) =>
    reportsRepo.rangeTotals(getDatabase(), userId, {
      from: validateDate(payload.from, 'from'),
      to: validateDate(payload.to, 'to')
    })
  )

  handle('reports:categoryBreakdown', ({ userId, payload }) =>
    reportsRepo.categoryBreakdown(getDatabase(), userId, {
      from: validateDate(payload.from, 'from'),
      to: validateDate(payload.to, 'to')
    })
  )

  handle('reports:incomeBySource', ({ userId, payload }) =>
    reportsRepo.incomeBySource(getDatabase(), userId, {
      from: validateDate(payload.from, 'from'),
      to: validateDate(payload.to, 'to')
    })
  )

  handle('reports:debtSummary', ({ userId }) => reportsRepo.debtSummary(getDatabase(), userId))

  handle('reports:monthRange', ({ payload }) => monthRange(validateMonth(payload.month)))
}
