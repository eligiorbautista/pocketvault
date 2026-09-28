import { format, parseISO } from 'date-fns'
import { DEBT_PAYMENT_TYPES, EXPENSE_CATEGORIES } from '@shared/constants.js'
import { currencySymbol, formatMoney } from '@shared/currency.js'
import { useSettingsStore } from '../store/settingsStore.js'

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
})

const CATEGORY_LABELS = new Map(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]))
const PAYMENT_TYPE_LABELS = new Map(DEBT_PAYMENT_TYPES.map((t) => [t.value, t.label]))

export function currentCurrency() {
  return useSettingsStore.getState().currency
}

export function formatCurrency(value) {
  return formatMoney(value, currentCurrency())
}

export function formatCompactCurrency(value) {
  return `${currencySymbol(currentCurrency())}${compactFormatter.format(Number(value) || 0)}`
}

export function formatPercent(value) {
  return `${Math.round(Number(value) || 0)}%`
}

export function formatDate(value, pattern = 'MMM d, yyyy') {
  if (!value) return '\u2014'
  try {
    return format(parseISO(value), pattern)
  } catch {
    return String(value)
  }
}

export function formatMonth(value, pattern = 'MMM yyyy') {
  if (!value) return '\u2014'
  try {
    return format(parseISO(`${value}-01`), pattern)
  } catch {
    return String(value)
  }
}

export function todayInput() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function currentMonthInput() {
  return format(new Date(), 'yyyy-MM')
}

export function categoryLabel(value) {
  return CATEGORY_LABELS.get(value) ?? value ?? 'Uncategorized'
}

export function paymentTypeLabel(value) {
  return PAYMENT_TYPE_LABELS.get(value) ?? value
}
