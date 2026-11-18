import { describe, expect, it } from 'vitest'
import { advanceDue, upcomingRules, validateRecurringInput } from './recurring.js'

describe('recurring dates', () => {
  it('advances daily, weekly, monthly and yearly without losing the day', () => {
    expect(advanceDue('2026-01-31', 'daily')).toBe('2026-02-01')
    expect(advanceDue('2026-01-31', 'weekly')).toBe('2026-02-07')
    expect(advanceDue('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advanceDue('2026-01-31', 'yearly')).toBe('2027-01-31')
  })

  it('lists rules due in the next window', () => {
    const rules = [
      { name: 'Rent', next_due: '2026-02-01' },
      { name: 'Later', next_due: '2026-04-01' }
    ]
    expect(upcomingRules(rules, '2026-01-15', 30).map((rule) => rule.name)).toEqual(['Rent'])
  })
})

describe('recurring validation', () => {
  const base = {
    name: 'Rent',
    kind: 'bill',
    wallet_id: 1,
    category: 'housing',
    amount: 100,
    frequency: 'monthly',
    next_due: '2026-02-01'
  }

  it('normalizes defaults and accepts a wallet in the list', () => {
    const row = validateRecurringInput({ ...base, reminder_days: undefined }, { wallets: [{ id: 1 }] })
    expect(row).toMatchObject({ kind: 'bill', frequency: 'monthly', reminder_days: 3, category: 'housing' })
  })

  it('rejects a wallet that is not active', () => {
    expect(() => validateRecurringInput(base, { wallets: [] })).not.toThrow()
    expect(() => validateRecurringInput({ ...base, wallet_id: 2 }, { wallets: [{ id: 1 }] })).toThrow('Wallet not found')
  })
})
