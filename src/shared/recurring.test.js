import { describe, expect, it } from 'vitest'
import { advanceDue, forecastCashFlow, upcomingRules, validateRecurringInput } from './recurring.js'

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

describe('cash-flow forecast', () => {
  it('expands occurrences and subtracts due debts', () => {
    const result = forecastCashFlow({
      startBalance: 1000,
      today: '2026-01-15',
      days: 60,
      rules: [
        { kind: 'bill', amount: 100, frequency: 'monthly', next_due: '2026-01-20' },
        { kind: 'income', amount: 500, frequency: 'monthly', next_due: '2026-01-25' }
      ],
      debts: [
        { remaining_amount: 200, due_date: '2026-02-01' },
        { remaining_amount: 999, due_date: '2026-05-01' }
      ]
    })
    expect(result).toMatchObject({ start: 1000, expenses: 200, income: 1000, debt: 200, end: 1600 })
  })
})

describe('recurring validation', () => {  const base = {
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
