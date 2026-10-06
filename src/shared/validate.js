import {
  DATE_PATTERN,
  EXPENSE_CATEGORY_VALUES,
  USERNAME_PATTERN
} from './constants.js'

export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

export function assert(condition, message) {
  if (!condition) throw new ValidationError(message)
}

export function validateId(value, field = 'id') {
  const n = Number(value)
  assert(Number.isInteger(n) && n > 0, `${field} must be a positive integer`)
  return n
}

export function validatePage(value, field = 'page') {
  if (value === undefined || value === null || value === '') return 1
  const n = Number(value)
  assert(Number.isInteger(n) && n >= 1, `${field} must be a positive integer`)
  return n
}

export function validateDate(value, field = 'date', { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    assert(!required, `${field} is required`)
    return null
  }
  assert(typeof value === 'string' && DATE_PATTERN.test(value), `${field} must be YYYY-MM-DD`)
  // `new Date('2023-02-31')` silently rolls over to Mar 3, so round-trip the
  // parsed value to reject dates that do not exist on the calendar.
  const [y, m, d] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(y, m - 1, d))
  // Date.UTC maps years 0-99 to 1900-1999, so re-apply the true year for early
  // dates (e.g. the '0001-01-01' range sentinel) before round-tripping.
  if (y < 100) parsed.setUTCFullYear(y)
  assert(!Number.isNaN(parsed.getTime()), `${field} is not a valid date`)
  assert(
    parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d,
    `${field} is not a valid calendar date`
  )
  return value
}

export function validateAmount(value, field = 'amount', { allowZero = false } = {}) {
  const n = typeof value === 'string' ? Number(value) : value
  assert(Number.isFinite(n), `${field} must be a number`)
  assert(allowZero ? n >= 0 : n > 0, `${field} must be ${allowZero ? 'zero or more' : 'greater than zero'}`)
  assert(n <= 1_000_000_000_000, `${field} is too large`)
  return Math.round(n * 100) / 100
}

export function validateText(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined || value === null) value = ''
  const text = String(value).trim()
  if (required) assert(text.length > 0, `${field} is required`)
  assert(text.length <= max, `${field} must be ${max} characters or fewer`)
  return text.length ? text : null
}

const CUSTOM_CATEGORY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &_'.\-]{0,39}$/u

export function validateCategory(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (EXPENSE_CATEGORY_VALUES.includes(text)) return text
  assert(CUSTOM_CATEGORY_PATTERN.test(text), 'category is not recognized')
  return text
}

export function validateUsername(value) {
  const username = String(value ?? '').trim()
  assert(USERNAME_PATTERN.test(username), 'username must be 3-30 characters: letters, numbers, _ or .')
  return username
}

// Passwords are the app's at-rest gate (and protect "require password on
// start"), so they must never be empty. Bounds also stop a multi-MB password
// from being fed to bcrypt (CPU DoS).
export function validatePassword(value, field = 'password') {
  const text = String(value ?? '')
  assert(text.length > 0, `${field} is required`)
  assert(text.length >= 6, `${field} must be at least 6 characters`)
  assert(text.length <= 128, `${field} must be 128 characters or fewer`)
  return text
}

export function validatePaymentType(value, allowed) {
  assert(allowed.includes(value), 'invalid payment type')
  return value
}

export function validateInt(value, field, { min = 0, max = 31 } = {}) {
  const n = Number(value)
  assert(Number.isInteger(n) && n >= min && n <= max, `${field} must be between ${min} and ${max}`)
  return n
}
