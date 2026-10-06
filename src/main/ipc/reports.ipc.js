import { handle } from './handle.js'
import { getDatabase } from '../db/connection.js'
import * as dashboardRepo from '../db/repositories/dashboard.js'
import * as reportsRepo from '../db/repositories/reports.js'
import { currentMonth, monthRange } from '../db/repositories/helpers.js'
import { validateDate } from '../db/validate.js'

function validateMonth(value) {
  const month = String(value ?? currentMonth())
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be in YYYY-MM format')
  const [, m] = month.split('-').map(Number)
  if (m < 1 || m > 12) throw new Error('month must be in YYYY-MM format')
  return month
}

// Dashboard period: { mode: 'month'|'range'|'all', month?, from?, to? }.
// Budgets are monthly, so every period resolves to one budget month too.
function validateDashboardPeriod(payload = {}) {
  let mode = payload.mode
  if (!['month', 'range', 'all'].includes(mode)) mode = payload.month ? 'month' : 'all'

  if (mode === 'month') {
    const month = validateMonth(payload.month)
    return { ...monthRange(month), month }
  }
  if (mode === 'range') {
    const from = validateDate(payload.from, 'from')
    const to = validateDate(payload.to, 'to')
    if (from > to) throw new Error('"from" must not be after "to"')
    return { from, to, month: to.slice(0, 7) }
  }
  return { from: '0001-01-01', to: '9999-12-31', month: currentMonth() }
}

function validateYear(value) {
  const year = String(value ?? new Date().getFullYear())
  if (!/^\d{4}$/.test(year)) throw new Error('year must be a 4-digit year')
  return year
}

export function registerReportsHandlers() {
  handle('reports:dashboard', ({ userId, payload }) =>
    dashboardRepo.getSummary(getDatabase(), userId, validateDashboardPeriod(payload))
  )

  handle('reports:monthlyTotals', ({ userId, payload }) =>
    reportsRepo.monthlyTotals(
      getDatabase(),
      userId,
      payload?.from
        ? { from: validateDate(payload.from, 'from'), to: validateDate(payload.to, 'to') }
        : validateYear(payload.year)
    )
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
}
