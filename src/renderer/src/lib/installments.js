import { addMonths, format, parseISO } from 'date-fns'
import { fromCents, toCents } from '@shared/money.js'

// First installment date: explicit field, else derived from the debt's
// created month + payment_day (legacy monthly debts).
export function deriveFirstPaymentDate(debt) {
  if (debt?.first_payment_date) return debt.first_payment_date
  if (!debt?.payment_day) return null
  const base = debt.created_at ? parseISO(debt.created_at) : new Date()
  const candidate = new Date(base.getFullYear(), base.getMonth(), debt.payment_day)
  return format(candidate, 'yyyy-MM-dd')
}

// Builds the monthly installment plan. The last row absorbs any remainder.
export function buildInstallments(debt) {
  if (debt?.payment_type !== 'monthly') return []
  const totalCents = toCents(debt.total_amount)
  const monthlyCents = toCents(debt.monthly_amount)
  if (totalCents <= 0 || monthlyCents <= 0) return []
  const count = Math.max(1, Math.ceil(totalCents / monthlyCents))
  const startDate = deriveFirstPaymentDate(debt)
  const base = startDate ? parseISO(startDate) : null
  const rows = []
  for (let index = 0; index < count; index += 1) {
    const amountCents =
      index === count - 1 ? totalCents - monthlyCents * (count - 1) : monthlyCents
    rows.push({
      index,
      due_date: base ? format(addMonths(base, index), 'yyyy-MM-dd') : null,
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
