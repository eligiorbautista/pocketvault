import { describe, expect, it } from 'vitest'
import { buildPayoffPlan } from './payoff.js'

const debts = [
  { id: 1, creditor: 'Small', remaining_amount: 100, monthly_amount: 50 },
  { id: 2, creditor: 'Large', remaining_amount: 300, monthly_amount: 100 },
  { id: 3, creditor: 'No plan', remaining_amount: 50, monthly_amount: 0 }
]

describe('payoff plan', () => {
  it('orders snowball by balance and flags debts without a monthly payment', () => {
    const plan = buildPayoffPlan(debts, 'snowball')
    expect(plan.ordered.map((debt) => debt.name)).toEqual(['Small', 'Large'])
    expect(plan.unplanned.map((debt) => debt.name)).toEqual(['No plan'])
    expect(plan.months).toBe(3)
  })

  it('orders avalanche by the largest balance first', () => {
    const plan = buildPayoffPlan(debts, 'avalanche')
    expect(plan.ordered.map((debt) => debt.name)).toEqual(['Large', 'Small'])
    expect(plan.months).toBe(3)
  })

  it('finishes faster with an extra payment', () => {
    const normal = buildPayoffPlan(debts, 'snowball')
    const extra = buildPayoffPlan(debts, 'snowball', 100)
    expect(extra.months).toBeLessThan(normal.months)
    expect(extra.finished).toBe(true)
  })
})
