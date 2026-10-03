// Pure, dependency-free reminder/schedule logic shared by the Electron main
// process and the renderer (both desktop and Android). Keeping it here means
// the installment schedule shown in the UI and the notifications that are
// scheduled can never drift apart.

import { fromCents, toCents } from './money.js'
import { formatMoney, DEFAULT_CURRENCY } from './currency.js'

const DAY_MS = 24 * 60 * 60 * 1000
export const REMINDER_HOUR = 9
export const DEFAULT_LEAD_DAYS = 3
export const MAX_LEAD_DAYS = 30

// --- date-only helpers (local time, no time-of-day drifting) ---------------

export function parseDateOnly(value) {
  if (!value) return null
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateOnly(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayDateOnly(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

// Renders a date-only string ("2023-05-05") as readable text ("May 5, 2003")
// for human-facing copy such as notification bodies.
export function formatReminderDate(value) {
  if (!value) return ''
  const date = parseDateOnly(value)
  if (!date) return String(value)
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

// Adds whole months, clamping the day to the target month's length (matches
// date-fns `addMonths` behaviour used elsewhere in the app).
export function addMonths(date, months) {
  const day = date.getDate()
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return target
}

function atHour(dateStr, hour) {
  const date = parseDateOnly(dateStr)
  if (!date) return null
  date.setHours(hour, 0, 0, 0)
  return date
}

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

// --- installment schedule (also consumed by the debt detail UI) ------------

// First installment date: explicit field, else derived from the debt's created
// month + payment_day (legacy monthly debts).
export function deriveFirstPaymentDate(debt) {
  if (debt?.first_payment_date) return String(debt.first_payment_date).slice(0, 10)
  if (!debt?.payment_day) return null
  const created = debt.created_at ? parseDateOnly(debt.created_at) : null
  const base = created ?? new Date()
  return formatDateOnly(new Date(base.getFullYear(), base.getMonth(), debt.payment_day))
}

// Builds the monthly installment plan. The last row absorbs any remainder.
export function buildInstallments(debt) {
  if (debt?.payment_type !== 'monthly') return []
  const totalCents = toCents(debt.total_amount)
  const monthlyCents = toCents(debt.monthly_amount)
  if (totalCents <= 0 || monthlyCents <= 0) return []
  const count = Math.max(1, Math.ceil(totalCents / monthlyCents))
  const start = deriveFirstPaymentDate(debt)
  const base = start ? parseDateOnly(start) : null
  const rows = []
  for (let index = 0; index < count; index += 1) {
    const amountCents =
      index === count - 1 ? totalCents - monthlyCents * (count - 1) : monthlyCents
    rows.push({
      index,
      due_date: base ? formatDateOnly(addMonths(base, index)) : null,
      amount: fromCents(amountCents)
    })
  }
  return rows
}

export function installmentStatus(paidCents, amountCents, dueDate, today) {
  if (amountCents > 0 && paidCents >= amountCents) return 'paid'
  if (paidCents > 0) return 'partial'
  if (dueDate && dueDate < today) return 'overdue'
  return 'upcoming'
}

function installmentPaidMap(payments) {
  const map = new Map()
  for (const payment of payments ?? []) {
    if (!payment?.installment_due) continue
    map.set(payment.installment_due, (map.get(payment.installment_due) ?? 0) + toCents(payment.amount))
  }
  return map
}

// The next installment that is not fully paid, or null when the plan is done.
export function nextUnpaidInstallment(debt, payments = []) {
  const installments = buildInstallments(debt)
  if (!installments.length) return null
  const paidMap = installmentPaidMap(payments)
  for (const installment of installments) {
    const paid = paidMap.get(installment.due_date) ?? 0
    if (paid < toCents(installment.amount)) return { ...installment, paid }
  }
  return null
}

// The date a debt is "due" for reminder purposes.
export function effectiveDueDate(debt, payments = []) {
  if (debt?.payment_type === 'monthly') {
    return nextUnpaidInstallment(debt, payments)?.due_date ?? null
  }
  return debt?.due_date ? String(debt.due_date).slice(0, 10) : null
}

// --- reminder plan ---------------------------------------------------------

function makeReminder(debt, kind, at, dueDate, amountValue, currency) {
  const amount = formatMoney(amountValue ?? debt.remaining_amount, currency)
  const prettyDate = formatReminderDate(dueDate)
  const titles = {
    upcoming: 'Payment due soon',
    due: 'Payment due today',
    overdue: 'Payment overdue'
  }
  const bodies = {
    upcoming: `${amount} to ${debt.creditor} is due on ${prettyDate}.`,
    due: `${amount} to ${debt.creditor} is due today (${prettyDate}).`,
    overdue: `${amount} to ${debt.creditor} was due on ${prettyDate}.`
  }
  return {
    key: `${debt.id}:${dueDate}:${kind}`,
    debtId: debt.id,
    creditor: debt.creditor,
    kind,
    dueDate,
    at,
    title: titles[kind],
    body: bodies[kind]
  }
}

// Builds the list of reminders for the active (non-archived, not fully paid)
// debts. Upcoming reminders fire `leadDays` before the due date at 09:00 local;
// due-day reminders fire on the date at 09:00; overdue debts produce a single
// reminder (delivered as soon as it can be). `at` values are Date objects.
export function buildReminderPlan(debts, paymentsByDebtId = {}, opts = {}) {
  const leadDays = clampInt(opts.leadDays ?? DEFAULT_LEAD_DAYS, 0, MAX_LEAD_DAYS)
  const now = opts.now ?? new Date()
  const currency = opts.currency || DEFAULT_CURRENCY
  const today = formatDateOnly(todayDateOnly(now))
  const horizonDays = opts.horizonDays ?? 400
  const maxPerDebt = opts.maxPerDebt ?? 24
  const horizonEnd = new Date(now.getTime() + horizonDays * DAY_MS)
  const plan = []

  for (const debt of debts ?? []) {
    if (!debt || debt.is_archived) continue
    if (toCents(debt.remaining_amount) <= 0) continue
    const payments = paymentsByDebtId?.[debt.id] ?? []

    if (debt.payment_type === 'monthly') {
      const paidMap = installmentPaidMap(payments)
      let overdueReported = false
      let scheduled = 0
      for (const installment of buildInstallments(debt)) {
        if ((paidMap.get(installment.due_date) ?? 0) >= toCents(installment.amount)) continue
        if (installment.due_date < today) {
          if (!overdueReported) {
            plan.push(makeReminder(debt, 'overdue', now, installment.due_date, installment.amount, currency))
            overdueReported = true
          }
          continue
        }
        const dueAt = atHour(installment.due_date, REMINDER_HOUR)
        if (!dueAt || dueAt > horizonEnd) continue
        if (leadDays > 0) {
          const remindAt = new Date(dueAt.getTime() - leadDays * DAY_MS)
          if (remindAt > now) {
            plan.push(makeReminder(debt, 'upcoming', remindAt, installment.due_date, installment.amount, currency))
          }
        }
        if (dueAt > now) plan.push(makeReminder(debt, 'due', dueAt, installment.due_date, installment.amount, currency))
        scheduled += 1
        if (scheduled >= maxPerDebt) break
      }
      continue
    }

    const dueDate = effectiveDueDate(debt, payments)
    if (!dueDate) continue
    if (dueDate < today) {
      plan.push(makeReminder(debt, 'overdue', now, dueDate, undefined, currency))
      continue
    }
    const dueAt = atHour(dueDate, REMINDER_HOUR)
    if (!dueAt || dueAt > horizonEnd) continue
    if (leadDays > 0) {
      const remindAt = new Date(dueAt.getTime() - leadDays * DAY_MS)
      if (remindAt > now) plan.push(makeReminder(debt, 'upcoming', remindAt, dueDate, undefined, currency))
    }
    if (dueAt > now) plan.push(makeReminder(debt, 'due', dueAt, dueDate, undefined, currency))
  }

  plan.sort((a, b) => a.at - b.at)
  return plan
}
