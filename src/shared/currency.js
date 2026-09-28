// Currency helpers shared by main (validation) and renderer (formatting).
// The full ISO 4217 list and currency names come from Intl, so no hardcoded
// table is needed and symbols are always correct (e.g. USD -> $, PHP -> ₱).

const FALLBACK_CODES = [
  'PHP', 'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CNY', 'SGD', 'AED',
  'SAR', 'KRW', 'INR', 'MYR', 'THB', 'IDR', 'VND', 'HKD', 'NZD', 'CHF'
]

let cachedCodes = null

export function currencyCodes() {
  if (cachedCodes) return cachedCodes
  try {
    cachedCodes = Intl.supportedValuesOf('currency').slice().sort()
  } catch {
    cachedCodes = FALLBACK_CODES.slice()
  }
  return cachedCodes
}

export function isValidCurrency(code) {
  return typeof code === 'string' && currencyCodes().includes(code)
}

export function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).formatToParts(0)
    return parts.find((part) => part.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

export function currencyName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

export function formatMoney(amount, code) {
  const value = Number(amount) || 0
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  } catch {
    return `${code} ${value.toFixed(2)}`
  }
}

export const DEFAULT_CURRENCY = 'PHP'
