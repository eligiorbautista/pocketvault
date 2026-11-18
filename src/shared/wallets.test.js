import { describe, expect, it } from 'vitest'
import {
  computeWalletBalances,
  contrastInk,
  summarizeWallets,
  validateCardImage,
  validateColor,
  validateTransferInput,
  validateWalletId,
  validateWalletInput,
  WALLET_PROVIDERS,
  WALLET_STYLE_PRESETS
} from './wallets.js'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

describe('wallet presets', () => {
  it('exposes 16 faces and 15 providers plus Other', () => {
    expect(WALLET_STYLE_PRESETS).toHaveLength(16)
    expect(Object.keys(WALLET_PROVIDERS)).toHaveLength(16)
    expect(WALLET_PROVIDERS.other.style).toBe('custom')
  })
})

describe('contrastInk', () => {
  it('uses dark ink on white and light colours', () => {
    expect(contrastInk('#ffffff')).toBe('#1b1b1b')
    expect(contrastInk('#f5a623')).toBe('#1b1b1b')
  })

  it('uses white ink on black and dark colours', () => {
    expect(contrastInk('#000000')).toBe('#ffffff')
    expect(contrastInk('#0038a8')).toBe('#ffffff')
  })
})

describe('wallet validation', () => {
  it('normalises a colour and rejects malformed values', () => {
    expect(validateColor('#AABBCC')).toBe('#aabbcc')
    expect(() => validateColor('blue')).toThrow('colour')
    expect(() => validateColor(null)).toThrow('colour')
    expect(() => validateColor('#abcd')).toThrow('colour')
  })

  it('accepts PNG/JPEG/WebP data URLs only', () => {
    expect(validateCardImage(PNG_DATA_URL)).toBe(PNG_DATA_URL)
    expect(validateCardImage(null)).toBeNull()
    expect(validateCardImage('')).toBeNull()
    expect(() => validateCardImage('data:image/svg+xml;base64,AAA')).toThrow('PNG, JPEG or WebP')
    expect(() => validateCardImage('https://example.com/card.png')).toThrow('PNG, JPEG or WebP')
    expect(() => validateCardImage('data:image/png;base64,' + 'A'.repeat(400_001))).toThrow('too large')
  })

  it('defaults missing fields and rejects unknown types/styles', () => {
    expect(validateWalletInput({ name: 'Pocket' })).toEqual({
      name: 'Pocket',
      type: 'cash',
      style: 'cash',
      opening_balance: 0,
      last4: null,
      color: null,
      card_image: null,
      interest_enabled: 0,
      interest_rate: 0,
      interest_crediting: 'monthly',
      interest_withholding: 1
    })
    expect(() => validateWalletInput({ name: 'X', type: 'nope' })).toThrow('type')
    expect(() => validateWalletInput({ name: 'X', type: 'bank', style: 'nope' })).toThrow('style')
    expect(
      validateWalletInput({ name: 'Cash', type: 'cash', style: 'custom', color: '#ffffff' })
    ).toEqual(expect.objectContaining({ style: 'cash', color: null, card_image: null }))
    expect(() => validateWalletInput({ name: 'X', type: 'bank', style: 'custom', color: 'red' })).toThrow('colour')
    expect(() => validateWalletId(0)).toThrow('wallet_id')
  })

  it('requires a name and formats last4/opening balance', () => {
    const wallet = validateWalletInput({
      name: '  BDO Savings  ',
      type: 'bank',
      style: 'bdo',
      opening_balance: '250.50',
      last4: '1234'
    })
    expect(wallet).toMatchObject({
      name: 'BDO Savings',
      type: 'bank',
      style: 'bdo',
      opening_balance: 250.5,
      last4: '1234',
      color: null,
      card_image: null
    })
    expect(() => validateWalletInput({ name: '', type: 'bank', style: 'bdo' })).toThrow('name')
    expect(() => validateWalletInput({ name: 'X', type: 'bank', style: 'bdo', last4: '12a4' })).toThrow(
      'last 4'
    )
  })

  it('seeds custom colour and clears it for presets', () => {
    expect(validateWalletInput({ name: 'Other', type: 'other', style: 'custom' })).toMatchObject({
      color: '#3b3b40',
      card_image: null
    })
    expect(
      validateWalletInput({
        name: 'Other',
        type: 'other',
        style: 'custom',
        color: '#ff0000',
        card_image: PNG_DATA_URL
      })
    ).toMatchObject({ color: '#ff0000', card_image: PNG_DATA_URL })
    expect(
      validateWalletInput({
        name: 'BDO',
        type: 'bank',
        style: 'bdo',
        color: '#ff0000',
        card_image: PNG_DATA_URL
      })
    ).toMatchObject({ color: null, card_image: null })
  })
})

describe('transfer validation', () => {
  it('rejects the same wallet on both sides', () => {
    expect(() =>
      validateTransferInput({
        from_wallet_id: 1,
        to_wallet_id: 1,
        amount: 10,
        date: '2026-01-01'
      })
    ).toThrow('different wallets')
  })

  it('normalises a valid transfer', () => {
    expect(
      validateTransferInput({
        from_wallet_id: '1',
        to_wallet_id: '2',
        amount: '10.555',
        date: '2026-01-01',
        notes: '  move  '
      })
    ).toEqual({
      from_wallet_id: 1,
      to_wallet_id: 2,
      amount: 10.56,
      date: '2026-01-01',
      notes: 'move'
    })
  })
})

describe('balance math', () => {
  const wallets = [
    { id: 1, opening_balance: 100 },
    { id: 2, opening_balance: 0 },
    { id: 3, opening_balance: 0 }
  ]

  it('adds income/loans/transfers in and subtracts expenses/payments/transfers out', () => {
    const result = computeWalletBalances({
      wallets,
      income: [{ wallet_id: 1, amount: 50 }],
      expenses: [{ wallet_id: 1, amount: 20 }],
      debts: [{ wallet_id: 1, total_amount: 1000 }],
      payments: [{ wallet_id: 1, amount: 300 }],
      transfers: [{ from_wallet_id: 1, to_wallet_id: 2, amount: 10 }]
    })
    expect(result.byId[1].balance).toBe(820)
    expect(result.byId[2].balance).toBe(10)
    expect(result.byId[3].balance).toBe(0)
    expect(result.total).toBe(830)
  })

  it('ignores rows for wallets outside the active set', () => {
    const result = computeWalletBalances({
      wallets,
      income: [{ wallet_id: 99, amount: 500 }]
    })
    expect(result.total).toBe(100)
  })

  it('ignores rows with no wallet id and empty images', () => {
    const result = computeWalletBalances({
      wallets,
      income: [{ wallet_id: null, amount: 500 }]
    })
    expect(result.total).toBe(100)
    expect(validateCardImage('')).toBeNull()
  })

  it('ignores null wallet ids and transfers from missing wallets', () => {
    const result = computeWalletBalances({
      wallets,
      income: [{ wallet_id: null, amount: 500 }],
      transfers: [{ from_wallet_id: 99, to_wallet_id: 1, amount: 5 }]
    })
    expect(result.byId[1].balance).toBe(105)
    expect(result.total).toBe(105)
  })

  it('summarises empty input', () => {
    expect(summarizeWallets()).toEqual({ netBalance: 0, liabilities: 0, netWorth: 0 })
  })

  it('summarises net worth against outstanding debt', () => {
    expect(summarizeWallets([{ balance: 100 }, { balance: 50 }], 3000)).toEqual({
      netBalance: 150,
      liabilities: 30,
      netWorth: 120
    })
  })
})
