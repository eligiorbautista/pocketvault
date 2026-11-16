import { describe, expect, it } from 'vitest'
import { backupRowCounts, validateBackupData, verifyBackupCounts } from './backupValidate.js'

const EMPTY = {
  income: [],
  expenses: [],
  debts: [],
  debt_payments: [],
  budgets: [],
  savings_goals: [],
  savings_contributions: [],
  wallets: [],
  wallet_transfers: []
}

const WALLET = {
  id: 1,
  name: 'Cash',
  type: 'cash',
  style: 'cash',
  opening_balance: 0,
  sort_order: 0
}

const VALID = {
  ...EMPTY,
  wallets: [
    WALLET,
    {
      id: 2,
      name: 'Custom',
      type: 'other',
      style: 'custom',
      opening_balance: 10,
      color: '#ff0000',
      card_image: 'data:image/png;base64,iVBORw0KGgo=',
      sort_order: 1
    }
  ],
  wallet_transfers: [
    { id: 1, from_wallet_id: 1, to_wallet_id: 2, amount: 10, date: '2026-01-01', notes: 'move' }
  ],
  income: [
    {
      id: 1,
      wallet_id: 1,
      amount: 100,
      date: '2026-01-01',
      source: 'Salary',
      notes: null,
      receipt_path: 'abc.png'
    }
  ],
  expenses: [{ wallet_id: 1, category: 'food', amount: 20, date: '2026-01-02', notes: null }],
  debts: [
    {
      id: 1,
      wallet_id: 1,
      creditor: 'Bank',
      total_amount: 500,
      paid_amount: 0,
      remaining_amount: 500,
      due_date: '2026-02-01',
      payment_type: 'fixed-date',
      monthly_amount: null,
      payment_day: null,
      first_payment_date: null,
      receipt_path: null,
      status: 'unpaid',
      notes: null
    }
  ],
  debt_payments: [
    {
      debt_id: 1,
      wallet_id: 1,
      amount: 10,
      date: '2026-01-03',
      payment_type: 'payment',
      installment_due: null,
      receipt_path: null,
      notes: null
    }
  ],
  budgets: [{ category: 'food', monthly_limit: 100 }],
  savings_goals: [{ goal_name: 'Trip', target_amount: 100, current_amount: 0, deadline: null }],
  savings_contributions: [
    { goal_id: 1, income_id: 1, amount: 10, date: '2026-01-04', notes: null }
  ]
}

function withRow(key, row) {
  return { ...EMPTY, [key]: [row] }
}

describe('validateBackupData', () => {
  it('accepts a complete payload and missing arrays', () => {
    expect(() => validateBackupData(VALID)).not.toThrow()
    expect(() => validateBackupData({})).not.toThrow()
  })

  it('rejects invalid wallet rows', () => {
    expect(() => validateBackupData(withRow('wallets', { ...WALLET, id: 0 }))).toThrow('wallet id')
    expect(() => validateBackupData(withRow('wallets', { ...WALLET, style: 'nope' }))).toThrow('style')
    expect(() => validateBackupData(withRow('wallets', { ...WALLET, sort_order: -1 }))).toThrow(
      'sort order'
    )
    expect(() =>
      validateBackupData(
        withRow('wallets', { ...WALLET, style: 'custom', color: 'blue' })
      )
    ).toThrow('colour')
    expect(() =>
      validateBackupData(
        withRow('wallets', {
          ...WALLET,
          style: 'custom',
          card_image: 'data:image/svg+xml;base64,AAA'
        })
      )
    ).toThrow('PNG, JPEG or WebP')
  })

  it('rejects invalid transfers', () => {
    const transfer = VALID.wallet_transfers[0]
    expect(() =>
      validateBackupData(withRow('wallet_transfers', { ...transfer, id: 0 }))
    ).toThrow('transfer id')
    expect(() =>
      validateBackupData(withRow('wallet_transfers', { ...transfer, from_wallet_id: 0 }))
    ).toThrow('from_wallet_id')
    expect(() =>
      validateBackupData(
        withRow('wallet_transfers', { ...transfer, to_wallet_id: transfer.from_wallet_id })
      )
    ).toThrow('different wallets')
    expect(() =>
      validateBackupData(withRow('wallet_transfers', { ...transfer, amount: 0 }))
    ).toThrow('greater than zero')
    expect(() =>
      validateBackupData(withRow('wallet_transfers', { ...transfer, date: 'nope' }))
    ).toThrow('YYYY-MM-DD')
  })

  it('rejects invalid wallet references and receipts on records', () => {
    expect(() =>
      validateBackupData(withRow('income', { ...VALID.income[0], wallet_id: 0 }))
    ).toThrow('income wallet')
    expect(() =>
      validateBackupData(withRow('expenses', { ...VALID.expenses[0], wallet_id: 0 }))
    ).toThrow('expense wallet')
    expect(() =>
      validateBackupData(withRow('debts', { ...VALID.debts[0], wallet_id: 0 }))
    ).toThrow('debt wallet')
    expect(() =>
      validateBackupData(withRow('debt_payments', { ...VALID.debt_payments[0], wallet_id: 0 }))
    ).toThrow('payment wallet')
    expect(() =>
      validateBackupData(withRow('income', { ...VALID.income[0], receipt_path: '../evil.png' }))
    ).toThrow('income receipt')
    expect(() =>
      validateBackupData(withRow('debts', { ...VALID.debts[0], receipt_path: '../evil.png' }))
    ).toThrow('debt receipt')
    expect(() =>
      validateBackupData(
        withRow('debt_payments', { ...VALID.debt_payments[0], receipt_path: '../evil.png' })
      )
    ).toThrow('payment receipt')
  })

  it('validates debt and payment fields', () => {
    expect(() =>
      validateBackupData(withRow('debts', { ...VALID.debts[0], payment_type: 'weekly' }))
    ).toThrow('payment type')
    expect(() =>
      validateBackupData(withRow('debts', { ...VALID.debts[0], monthly_amount: 0 }))
    ).toThrow('greater than zero')
    expect(() =>
      validateBackupData(withRow('debts', { ...VALID.debts[0], payment_day: 99 }))
    ).toThrow('between 1 and 31')
    expect(() =>
      validateBackupData(withRow('debts', { ...VALID.debts[0], status: 'nope' }))
    ).toThrow('debt status')
    expect(() =>
      validateBackupData(
        withRow('debt_payments', { ...VALID.debt_payments[0], payment_type: 'extra' })
      )
    ).toThrow('payment type')
    expect(() =>
      validateBackupData(
        withRow('debt_payments', { ...VALID.debt_payments[0], installment_due: 'nope' })
      )
    ).toThrow('YYYY-MM-DD')
  })

  it('validates budgets, goals and contributions', () => {
    expect(() => validateBackupData(withRow('budgets', { category: 'nope<script>' }))).toThrow()
    expect(() =>
      validateBackupData(withRow('budgets', { category: 'food', monthly_limit: -1 }))
    ).toThrow('zero or more')
    expect(() => validateBackupData(withRow('savings_goals', {})).toThrow('goal name'))
    expect(() =>
      validateBackupData(withRow('savings_goals', { goal_name: 'X', target_amount: 0 }))
    ).toThrow('greater than zero')
    expect(() =>
      validateBackupData(
        withRow('savings_contributions', { goal_id: 1, amount: 0, date: '2026-01-01' })
      )
    ).toThrow('greater than zero')
  })

  it('accepts rows without optional ids and wallet references', () => {
    expect(() =>
      validateBackupData({
        ...EMPTY,
        wallets: [{ name: 'Cash', type: 'cash', style: 'cash' }],
        wallet_transfers: [
          { from_wallet_id: 1, to_wallet_id: 2, amount: 1, date: '2026-01-01' }
        ],
        income: [{ amount: 1, date: '2026-01-01' }],
        expenses: [{ category: 'food', amount: 1, date: '2026-01-01' }],
        debts: [
          {
            creditor: 'Bank',
            total_amount: 1,
            paid_amount: 0,
            remaining_amount: 1
          }
        ],
        debt_payments: [{ amount: 1, date: '2026-01-01' }]
      })
    ).not.toThrow()
  })
})

describe('backup counts', () => {
  it('counts every collection and ignores missing arrays', () => {
    expect(backupRowCounts(VALID)).toEqual({
      income: 1,
      expenses: 1,
      debts: 1,
      debtPayments: 1,
      budgets: 1,
      savingsGoals: 1,
      savingsContributions: 1,
      wallets: 2,
      walletTransfers: 1
    })
    expect(backupRowCounts({})).toMatchObject({ income: 0, wallets: 0, walletTransfers: 0 })
  })

  it('verifies manifest counts when present', () => {
    const counts = { ...backupRowCounts(VALID), receipts: 1 }
    expect(() => verifyBackupCounts({ counts }, VALID, 1)).not.toThrow()
    expect(() => verifyBackupCounts({}, VALID, 1)).not.toThrow()
    expect(() => verifyBackupCounts({ counts: { income: 2 } }, VALID, 1)).toThrow(
      'manifest counts do not match the data'
    )
    expect(() => verifyBackupCounts({ counts: { receipts: 2 } }, VALID, 1)).toThrow(
      'manifest counts do not match the receipts'
    )
  })
})
