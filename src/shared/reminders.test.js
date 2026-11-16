import { describe, expect, it } from 'vitest'
import {
  addMonths,
  buildInstallments,
  buildReminderPlan,
  deriveFirstPaymentDate,
  effectiveDueDate,
  formatDateOnly,
  formatReminderDate,
  installmentStatus,
  nextUnpaidInstallment,
  parseDateOnly,
  todayDateOnly
} from './reminders.js'

const monthlyDebt = {
  id: 1,
  creditor: 'Bank',
  payment_type: 'monthly',
  total_amount: 300,
  monthly_amount: 100,
  first_payment_date: '2026-02-15',
  remaining_amount: 300,
  is_archived: 0
}

const fixedDebt = {
  id: 2,
  creditor: 'Friend',
  payment_type: 'fixed-date',
  due_date: '2026-01-10',
  remaining_amount: 50,
  is_archived: 0
}

describe('date-only helpers', () => {
  it('parses and formats dates without time drift', () => {
    expect(parseDateOnly('2026-11-17')).toEqual(new Date(2026, 10, 17))
    expect(parseDateOnly('2026-11-17T12:00:00')).toEqual(new Date(2026, 10, 17))
    expect(parseDateOnly('')).toBeNull()
    expect(parseDateOnly(null)).toBeNull()
    expect(parseDateOnly('nope')).toBeNull()
    expect(formatDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayDateOnly(new Date(2026, 10, 17, 15, 30))).toEqual(new Date(2026, 10, 17))
  })

  it('renders human reminder dates and falls back for bad input', () => {
    expect(formatReminderDate('2026-01-05')).toBe('January 5, 2026')
    expect(formatReminderDate('')).toBe('')
    expect(formatReminderDate('nope')).toBe('nope')
  })

  it('adds months while clamping the day', () => {
    expect(addMonths(new Date(2024, 0, 31), 1)).toEqual(new Date(2024, 1, 29))
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28))
    expect(addMonths(new Date(2026, 0, 15), 2)).toEqual(new Date(2026, 2, 15))
  })
})

describe('installment schedules', () => {
  it('derives the first date from the explicit field or payment day', () => {
    expect(deriveFirstPaymentDate(monthlyDebt)).toBe('2026-02-15')
    expect(
      deriveFirstPaymentDate({ payment_day: 20, created_at: '2026-01-03T10:00:00' })
    ).toBe('2026-01-20')
    expect(deriveFirstPaymentDate({ payment_day: 20, created_at: null })).toMatch(/^\d{4}-\d{2}-20$/)
    expect(deriveFirstPaymentDate({ payment_day: null })).toBeNull()
    expect(deriveFirstPaymentDate(null)).toBeNull()
  })

  it('builds rows with the remainder in the last row', () => {
    const rows = buildInstallments(monthlyDebt)
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.due_date)).toEqual(['2026-02-15', '2026-03-15', '2026-04-15'])
    expect(rows.map((row) => row.amount)).toEqual([100, 100, 100])

    const uneven = buildInstallments({ ...monthlyDebt, total_amount: 250 })
    expect(uneven.map((row) => row.amount)).toEqual([100, 100, 50])
  })

  it('returns no schedule for non-monthly or zero amounts', () => {
    expect(buildInstallments(fixedDebt)).toEqual([])
    expect(buildInstallments({ ...monthlyDebt, total_amount: 0 })).toEqual([])
    expect(buildInstallments({ ...monthlyDebt, monthly_amount: 0 })).toEqual([])
  })

  it('supports a schedule without a start date', () => {
    const rows = buildInstallments({ ...monthlyDebt, first_payment_date: null })
    expect(rows.every((row) => row.due_date === null)).toBe(true)
  })

  it('classifies paid, partial, overdue and upcoming installments', () => {
    expect(installmentStatus(100, 100, '2026-01-01', '2026-01-02')).toBe('paid')
    expect(installmentStatus(50, 100, '2026-01-01', '2026-01-02')).toBe('partial')
    expect(installmentStatus(0, 100, '2026-01-01', '2026-01-02')).toBe('overdue')
    expect(installmentStatus(0, 100, '2026-01-03', '2026-01-02')).toBe('upcoming')
  })

  it('finds the next unpaid installment and ignores unrelated payments', () => {
    const payments = [
      { installment_due: '2026-02-15', amount: 100 },
      { installment_due: null, amount: 999 }
    ]
    expect(nextUnpaidInstallment(monthlyDebt, payments)).toMatchObject({
      due_date: '2026-03-15',
      amount: 100
    })
    expect(nextUnpaidInstallment(monthlyDebt, [])).toMatchObject({ due_date: '2026-02-15' })
    expect(nextUnpaidInstallment({ ...monthlyDebt, payment_type: 'fixed-date' })).toBeNull()
    expect(
      nextUnpaidInstallment(monthlyDebt, [
        { installment_due: '2026-02-15', amount: 100 },
        { installment_due: '2026-03-15', amount: 100 },
        { installment_due: '2026-04-15', amount: 100 }
      ])
    ).toBeNull()
  })

  it('uses the next installment for monthly debts and the due date otherwise', () => {
    expect(effectiveDueDate(monthlyDebt)).toBe('2026-02-15')
    expect(effectiveDueDate(fixedDebt)).toBe('2026-01-10')
    expect(effectiveDueDate({ payment_type: 'fixed-date', due_date: null })).toBeNull()
    expect(effectiveDueDate({ payment_type: 'no-schedule' })).toBeNull()
  })
})

describe('reminder plan', () => {
  const now = new Date(2026, 0, 1, 10, 0, 0)

  it('returns nothing for an empty plan', () => {
    expect(buildReminderPlan([], {}, { now })).toEqual([])
  })

  it('skips archived and fully paid debts', () => {
    expect(
      buildReminderPlan(
        [
          { ...monthlyDebt, is_archived: 1 },
          { ...monthlyDebt, remaining_amount: 0 }
        ],
        {},
        { now }
      )
    ).toEqual([])
  })

  it('schedules upcoming and due reminders at 09:00 with a lead time', () => {
    const oneInstallment = { ...monthlyDebt, total_amount: 100 }
    const plan = buildReminderPlan([oneInstallment], {}, { now, leadDays: 3 })
    expect(plan.map((reminder) => reminder.kind)).toEqual(['upcoming', 'due'])
    expect(plan[0].at).toEqual(new Date(2026, 1, 12, 9))
    expect(plan[1].at).toEqual(new Date(2026, 1, 15, 9))
    expect(plan[0].body).toContain('Bank')
  })

  it('supports leadDays 0 and clamps out-of-range values', () => {
    const oneInstallment = { ...monthlyDebt, total_amount: 100 }
    expect(
      buildReminderPlan([oneInstallment], {}, { now, leadDays: 0 }).map((reminder) => reminder.kind)
    ).toEqual(['due'])
    expect(
      buildReminderPlan([fixedDebt], {}, { now, leadDays: 100 }).map((reminder) => reminder.kind)
    ).toEqual(['due'])
    expect(
      buildReminderPlan([oneInstallment], {}, { now, leadDays: -5 }).map(
        (reminder) => reminder.kind
      )
    ).toEqual(['due'])
  })

  it('reports only the first overdue installment', () => {
    const overdue = { ...monthlyDebt, first_payment_date: '2025-12-15' }
    const plan = buildReminderPlan([overdue], {}, { now, leadDays: 0 })
    expect(plan.filter((reminder) => reminder.kind === 'overdue')).toHaveLength(1)
    expect(plan.find((reminder) => reminder.kind === 'overdue').dueDate).toBe('2025-12-15')
  })

  it('respects the horizon and max per debt', () => {
    expect(
      buildReminderPlan([monthlyDebt], {}, { now, leadDays: 0, horizonDays: 1 })
    ).toEqual([])
    const capped = buildReminderPlan([monthlyDebt], {}, { now, leadDays: 3, maxPerDebt: 1 })
    expect(capped).toHaveLength(2)
  })

  it('handles fixed-date debts, overdue and no due date', () => {
    const plan = buildReminderPlan([fixedDebt], {}, { now, leadDays: 3 })
    expect(plan.map((reminder) => reminder.kind)).toEqual(['upcoming', 'due'])
    expect(plan[0].at).toEqual(new Date(2026, 0, 7, 9))

    const overdue = buildReminderPlan(
      [{ ...fixedDebt, due_date: '2025-12-01' }],
      {},
      { now }
    )
    expect(overdue).toHaveLength(1)
    expect(overdue[0].kind).toBe('overdue')
    expect(overdue[0].body).toContain('₱50.00')

    expect(buildReminderPlan([{ ...fixedDebt, due_date: null }], {}, { now })).toEqual([])
  })

  it('uses the currency option and the remaining amount for fixed debts', () => {
    const plan = buildReminderPlan([fixedDebt], {}, { now, currency: 'USD', leadDays: 0 })
    expect(plan[0].body).toContain('$50.00')
  })

  it('skips payments that fully cover an installment', () => {
    const payments = { 1: [{ installment_due: '2026-02-15', amount: 100 }] }
    const plan = buildReminderPlan([monthlyDebt], payments, { now, leadDays: 0 })
    expect(plan.some((reminder) => reminder.dueDate === '2026-02-15')).toBe(false)
    expect(plan[0].dueDate).toBe('2026-03-15')
  })

  it('handles missing arguments, bad lead days and payments without a due date', () => {
    expect(buildReminderPlan(undefined, undefined, { now })).toEqual([])
    expect(buildReminderPlan([fixedDebt], {}, { now, leadDays: 'abc' })).not.toEqual([])
    expect(nextUnpaidInstallment(monthlyDebt)).toMatchObject({ due_date: '2026-02-15' })
    expect(nextUnpaidInstallment(monthlyDebt, null)).toMatchObject({ due_date: '2026-02-15' })
    expect(nextUnpaidInstallment(monthlyDebt, [{}])).toMatchObject({ due_date: '2026-02-15' })
    expect(effectiveDueDate({ ...monthlyDebt, first_payment_date: null })).toBeNull()
    expect(
      buildReminderPlan([{ ...fixedDebt, due_date: '2000-01-01' }], {}, { leadDays: 0 })
    ).toHaveLength(1)
    expect(
      buildReminderPlan([{ ...monthlyDebt, first_payment_date: 'not-a-date' }], {}, { now })
    ).toEqual([])
  })

  it('reports one overdue reminder across several overdue installments', () => {
    const plan = buildReminderPlan(
      [{ ...monthlyDebt, first_payment_date: '2025-11-15' }],
      {},
      { now, leadDays: 0 }
    )
    expect(plan.filter((reminder) => reminder.kind === 'overdue')).toHaveLength(1)
  })

  it('drops upcoming and due reminders that are already in the past', () => {
    const near = buildReminderPlan(
      [{ ...fixedDebt, due_date: '2026-01-03' }],
      {},
      { now, leadDays: 3 }
    )
    expect(near.map((reminder) => reminder.kind)).toEqual(['due'])

    const today = buildReminderPlan(
      [{ ...fixedDebt, due_date: '2026-01-01' }],
      {},
      { now, leadDays: 0 }
    )
    expect(today).toEqual([])
    expect(
      buildReminderPlan(
        [{ ...monthlyDebt, total_amount: 100, first_payment_date: '2026-01-01' }],
        {},
        { now, leadDays: 3 }
      )
    ).toEqual([])
    expect(
      buildReminderPlan([{ ...fixedDebt, due_date: '2028-01-01' }], {}, { now, horizonDays: 1 })
    ).toEqual([])
  })
})
