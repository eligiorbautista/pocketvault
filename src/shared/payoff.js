import { fromCents, toCents } from './money.js'

// Read-only projection. Debts without a monthly payment are reported as
// "needs a monthly amount" instead of inventing an interest rate or schedule.
export function buildPayoffPlan(debts, strategy = 'snowball', extra = 0) {
  const active = (debts ?? [])
    .filter((debt) => !debt.is_archived && Number(debt.remaining_amount) > 0)
    .map((debt) => ({
      id: debt.id,
      name: debt.creditor,
      remainingCents: toCents(debt.remaining_amount),
      monthlyCents: toCents(debt.monthly_amount ?? 0)
    }))
  const unplanned = active.filter((debt) => debt.monthlyCents <= 0)
  const planned = active.filter((debt) => debt.monthlyCents > 0)
  const extraCents = toCents(extra)
  const ordered = [...planned].sort((a, b) =>
    strategy === 'avalanche'
      ? b.remainingCents - a.remainingCents
      : a.remainingCents - b.remainingCents
  )
  const balances = new Map(ordered.map((debt) => [debt.id, debt.remainingCents]))
  let months = 0
  let totalPaid = 0
  while ([...balances.values()].some((value) => value > 0) && months < 600) {
    months += 1
    let available = extraCents
    for (const debt of ordered) {
      const balance = balances.get(debt.id)
      if (balance <= 0) continue
      const payment = Math.min(balance, debt.monthlyCents + available)
      available -= Math.max(0, payment - debt.monthlyCents)
      balances.set(debt.id, balance - payment)
      totalPaid += payment
    }
  }
  return {
    strategy,
    ordered,
    unplanned,
    months: ordered.length && balances.size ? months : 0,
    totalPaid: fromCents(totalPaid),
    finished: [...balances.values()].every((value) => value <= 0)
  }
}
