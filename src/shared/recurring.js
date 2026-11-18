import { assert, validateAmount, validateCategory, validateDate, validateId, validateInt, validateText } from './validate.js'

export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly']
export const RECURRING_KINDS = ['bill', 'subscription', 'income']

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function iso(date) {
  return date.toISOString().slice(0, 10)
}

export function advanceDue(value, frequency) {
  const date = parseDate(value)
  if (frequency === 'daily') date.setUTCDate(date.getUTCDate() + 1)
  else if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
  else if (frequency === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1)
  else {
    const day = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() + 1)
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    date.setUTCDate(Math.min(day, last))
  }
  return iso(date)
}

export function validateRecurringInput(payload = {}, { wallets = [] } = {}) {
  const kind = payload.kind ?? 'bill'
  assert(RECURRING_KINDS.includes(kind), 'recurring kind is not recognized')
  const frequency = payload.frequency ?? 'monthly'
  assert(RECURRING_FREQUENCIES.includes(frequency), 'recurring frequency is not recognized')
  const walletId = validateId(payload.wallet_id, 'wallet_id')
  assert(!wallets.length || wallets.some((wallet) => wallet.id === walletId), 'Wallet not found')
  const amount = validateAmount(payload.amount, 'amount')
  const nextDue = validateDate(payload.next_due, 'next_due')
  const reminderDays = payload.reminder_days === undefined || payload.reminder_days === null
    ? 3
    : validateInt(payload.reminder_days, 'reminder_days', { min: 0, max: 30 })
  const category = kind === 'income' ? null : validateCategory(payload.category ?? 'other')
  return {
    name: validateText(payload.name, 'name', { required: true, max: 120 }),
    kind,
    wallet_id: walletId,
    category,
    amount,
    frequency,
    next_due: nextDue,
    reminder_days: reminderDays
  }
}

export function upcomingRules(rules, today, days = 30) {
  const end = new Date(`${today}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + days)
  return rules
    .filter((rule) => rule.next_due && rule.next_due <= iso(end))
    .sort((a, b) => a.next_due.localeCompare(b.next_due) || a.name.localeCompare(b.name))
}
