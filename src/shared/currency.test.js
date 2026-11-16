import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CURRENCY,
  currencyCodes,
  currencyName,
  currencySymbol,
  formatMoney,
  isValidCurrency
} from './currency.js'

describe('currency', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('exposes a sorted ISO list including peso and dollar', () => {
    const codes = currencyCodes()
    expect(codes).toContain('PHP')
    expect(codes).toContain('USD')
    expect([...codes].sort()).toEqual(codes)
    expect(DEFAULT_CURRENCY).toBe('PHP')
  })

  it('validates codes strictly', () => {
    expect(isValidCurrency('PHP')).toBe(true)
    expect(isValidCurrency('php')).toBe(false)
    expect(isValidCurrency('ZZZ')).toBe(false)
    expect(isValidCurrency(null)).toBe(false)
  })

  it('resolves symbols and names from Intl', () => {
    expect(currencySymbol('PHP')).toBe('₱')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencyName('PHP')).toMatch(/Peso/i)
  })

  it('falls back to the code for unknown currencies', () => {
    expect(currencySymbol('ZZZ')).toBe('ZZZ')
    expect(currencyName('ZZZ')).toBe('ZZZ')
    expect(formatMoney(1, 'ZZZ')).toBe('ZZZ\u00a01.00')
  })

  it('returns the code when Intl formatting throws', () => {
    const numberFormat = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function () {
      throw new Error('bad currency')
    })
    expect(currencySymbol('PHP')).toBe('PHP')
    expect(formatMoney(2, 'PHP')).toBe('PHP 2.00')
    numberFormat.mockRestore()

    const displayNames = vi.spyOn(Intl, 'DisplayNames').mockImplementation(function () {
      throw new Error('bad currency')
    })
    expect(currencyName('PHP')).toBe('PHP')
    displayNames.mockRestore()
  })

  it('formats two decimals and treats invalid amounts as zero', () => {
    expect(formatMoney(1234.5, 'PHP')).toContain('1,234.50')
    expect(formatMoney('not-a-number', 'PHP')).toContain('0.00')
  })

  it('falls back to the hardcoded list when Intl cannot enumerate currencies', async () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new Error('unsupported')
    })
    vi.resetModules()
    const fresh = await import('./currency.js')
    expect(fresh.currencyCodes()).toContain('PHP')
    expect(fresh.currencyCodes()).toContain('USD')
  })

  it('falls back when Intl omits the currency part', () => {
    const numberFormat = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function () {
      return { formatToParts: () => [{ type: 'literal', value: 'x' }] }
    })
    expect(currencySymbol('PHP')).toBe('PHP')
    numberFormat.mockRestore()

    const displayNames = vi.spyOn(Intl, 'DisplayNames').mockImplementation(function () {
      return { of: () => undefined }
    })
    expect(currencyName('PHP')).toBe('PHP')
    displayNames.mockRestore()
  })
})
