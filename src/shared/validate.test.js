import { describe, expect, it } from 'vitest'
import {
  assert,
  validateAmount,
  validateCategory,
  validateDate,
  validateId,
  validateInt,
  validatePage,
  validatePassword,
  validatePaymentType,
  validateText,
  validateUsername
} from './validate.js'

describe('validateId', () => {
  it('accepts positive integers and rejects everything else', () => {
    expect(validateId('7')).toBe(7)
    expect(() => validateId(0)).toThrow('positive integer')
    expect(() => validateId(1.5)).toThrow('positive integer')
    expect(() => validateId('x', 'wallet_id')).toThrow('wallet_id')
  })
})

describe('validatePage', () => {
  it('defaults to page one and rejects zero/negative values', () => {
    expect(validatePage(undefined)).toBe(1)
    expect(validatePage('')).toBe(1)
    expect(validatePage('3')).toBe(3)
    expect(() => validatePage(0)).toThrow('positive integer')
  })
})

describe('validateDate', () => {
  it('requires a real calendar date by default', () => {
    expect(validateDate('2026-11-17')).toBe('2026-11-17')
    expect(() => validateDate('')).toThrow('required')
    expect(validateDate('', 'date', { required: false })).toBeNull()
    expect(() => validateDate('17-11-2026')).toThrow('YYYY-MM-DD')
    expect(() => validateDate('2026-02-30')).toThrow('calendar date')
  })

  it('supports early years used as range sentinels', () => {
    expect(validateDate('0001-01-01')).toBe('0001-01-01')
  })
})

describe('validateAmount', () => {
  it('rounds to centavos and enforces the sign', () => {
    expect(validateAmount('12.345')).toBe(12.35)
    expect(validateAmount(0, 'amount', { allowZero: true })).toBe(0)
    expect(() => validateAmount(0)).toThrow('greater than zero')
    expect(() => validateAmount(-1)).toThrow('greater than zero')
    expect(() => validateAmount('abc')).toThrow('must be a number')
    expect(() => validateAmount(1e13)).toThrow('too large')
  })
})

describe('validateText', () => {
  it('trims, requires and bounds text', () => {
    expect(validateText('  hello  ', 'name')).toBe('hello')
    expect(validateText('   ', 'name')).toBeNull()
    expect(() => validateText('', 'name', { required: true })).toThrow('required')
    expect(() => validateText('toolong', 'name', { max: 3 })).toThrow('3 characters or fewer')
    expect(validateText(null, 'name')).toBeNull()
  })
})

describe('validateCategory', () => {
  it('accepts built-ins and safe custom labels', () => {
    expect(validateCategory('food')).toBe('food')
    expect(validateCategory('  Pet care  ')).toBe('Pet care')
    expect(validateCategory("Kids' school & books")).toBe("Kids' school & books")
    expect(() => validateCategory(123)).toThrow()
    expect(() => validateCategory('')).toThrow()
    expect(() => validateCategory('bad<script>')).toThrow()
    expect(() => validateCategory('a'.repeat(41))).toThrow()
  })
})

describe('validateUsername and validatePassword', () => {
  it('enforces the username pattern', () => {
    expect(validateUsername(' alice.dev ')).toBe('alice.dev')
    expect(() => validateUsername('ab')).toThrow('3-30')
    expect(() => validateUsername(null)).toThrow('3-30')
    expect(() => validateUsername('bad name')).toThrow('3-30')
  })

  it('enforces password bounds', () => {
    expect(validatePassword('secret123')).toBe('secret123')
    expect(() => validatePassword('')).toThrow('required')
    expect(() => validatePassword(null)).toThrow('required')
    expect(() => validatePassword('12345')).toThrow('at least 6')
    expect(() => validatePassword('x'.repeat(129))).toThrow('128')
  })
})

describe('misc validators', () => {
  it('checks payment types and bounded integers', () => {
    expect(validatePaymentType('monthly', ['monthly'])).toBe('monthly')
    expect(() => validatePaymentType('weekly', ['monthly'])).toThrow('invalid payment type')
    expect(validateInt('5', 'day', { min: 1, max: 31 })).toBe(5)
    expect(() => validateInt(0, 'day', { min: 1, max: 31 })).toThrow('between 1 and 31')
  })

  it('assert throws a ValidationError with the message', () => {
    expect(() => assert(false, 'nope')).toThrow('nope')
    expect(() => assert(true, 'nope')).not.toThrow()
  })
})
