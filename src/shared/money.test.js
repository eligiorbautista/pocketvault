import { describe, expect, it } from 'vitest'
import { fromCents, round2, sumPesos, toCents } from './money.js'
import { validateAmount, validateDate } from './validate.js'

describe('money', () => {
  it('keeps arithmetic in integer centavos', () => {
    expect(toCents(19.99)).toBe(1999)
    expect(toCents('12.34')).toBe(1234)
    expect(toCents('nope')).toBe(0)
    expect(toCents(undefined)).toBe(0)
    expect(toCents(0.1) + toCents(0.2)).toBe(30)
    expect(fromCents(30)).toBe(0.3)
    expect(round2(1.006)).toBe(1.01)
    expect(sumPesos([0.1, 0.2])).toBe(0.3)
  })

  it('rejects invalid amounts and impossible dates', () => {
    expect(() => validateAmount(0)).toThrow('greater than zero')
    expect(() => validateAmount(-1)).toThrow('greater than zero')
    expect(validateAmount('12.345')).toBe(12.35)
    expect(() => validateDate('2026-02-30')).toThrow('calendar date')
    expect(validateDate('2024-02-29')).toBe('2024-02-29')
  })
})
