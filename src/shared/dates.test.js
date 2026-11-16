import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentMonth, monthRange, todayISO } from './dates.js'

describe('dates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds a full month range including leap years', () => {
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('returns the current month and day in local time', () => {
    vi.setSystemTime(new Date(2026, 10, 17, 12, 0, 0))
    expect(currentMonth()).toBe('2026-11')
    expect(todayISO()).toBe('2026-11-17')
  })

  it('zero-pads single-digit months and days', () => {
    vi.setSystemTime(new Date(2026, 0, 5, 8, 30, 0))
    expect(currentMonth()).toBe('2026-01')
    expect(todayISO()).toBe('2026-01-05')
  })
})
