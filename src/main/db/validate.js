import { DATE_PATTERN, EXPENSE_CATEGORY_VALUES, USERNAME_PATTERN } from '../../shared/constants.js'

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
  const parsed = new Date(`${value}T00:00:00Z`)
  assert(!Number.isNaN(parsed.getTime()), `${field} is not a valid date`)
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

export function validateCategory(value) {
  assert(
    typeof value === 'string' && EXPENSE_CATEGORY_VALUES.includes(value),
    'category is not recognized'
  )
  return value
}

export function validateUsername(value) {
  const username = String(value ?? '').trim()
  assert(USERNAME_PATTERN.test(username), 'username must be 3-30 characters: letters, numbers, _ or .')
  return username
}

export function validatePassword(value) {
  return String(value ?? '')
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
