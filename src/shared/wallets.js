// Shared wallet rules for desktop (better-sqlite3) and the Capacitor adapter.
// Balances are never stored: every total is derived from the rows that point at
// a wallet, in integer centavos.
import { fromCents, toCents } from './money.js'
import {
  validateAmount,
  validateDate,
  validateId,
  validateText,
  assert
} from './validate.js'

export const WALLET_TYPES = ['cash', 'bank', 'ewallet', 'other']

export const WALLET_TYPE_LABELS = {
  cash: 'Cash',
  bank: 'Bank debit card',
  ewallet: 'E-wallet',
  other: 'Other'
}

// 16 colour/pattern studies. `pattern` is descriptive; the actual art lives in
// assets/wallets.css so the shared module stays platform-agnostic.
export const WALLET_STYLE_PRESETS = [
  { id: 'cash', label: 'Cash', from: '#211d17', to: '#050505', ink: '#ece3d6', accent: '#d6b25c', pattern: 'monogram' },
  { id: 'bdo', label: 'BDO', from: '#0038a8', to: '#001f66', ink: '#ffffff', accent: '#7fb2ff', pattern: 'wave' },
  { id: 'bpi', label: 'BPI', from: '#a91b2b', to: '#6d0f1c', ink: '#ffffff', accent: '#ffd7dc', pattern: 'none' },
  { id: 'metrobank', label: 'Metrobank', from: '#0357ff', to: '#7a1dff', ink: '#ffffff', accent: '#cfd8ff', pattern: 'none' },
  { id: 'unionbank', label: 'UnionBank', from: '#f4efe6', to: '#d9cfbf', ink: '#22201c', accent: '#8c8272', pattern: 'none' },
  { id: 'securitybank', label: 'Security Bank', from: '#0b2e5c', to: '#071d3b', ink: '#ffffff', accent: '#8fb6e8', pattern: 'none' },
  { id: 'rcbc', label: 'RCBC', from: '#0033a0', to: '#001f66', ink: '#ffffff', accent: '#ffcf5c', pattern: 'none' },
  { id: 'landbank', label: 'Landbank', from: '#0a7a42', to: '#03401f', ink: '#ffffff', accent: '#facc15', pattern: 'none' },
  { id: 'pnb', label: 'PNB', from: '#0b2f7a', to: '#061a44', ink: '#ffffff', accent: '#ff6b7a', pattern: 'none' },
  { id: 'psbank', label: 'PSBank', from: '#0a2a4f', to: '#061c37', ink: '#ffffff', accent: '#f7c948', pattern: 'none' },
  { id: 'gcash', label: 'GCash', from: '#1a8cff', to: '#0044a8', ink: '#ffffff', accent: '#bfe0ff', pattern: 'none' },
  { id: 'maya', label: 'Maya', from: '#12351f', to: '#050505', ink: '#ffffff', accent: '#00d26a', pattern: 'none' },
  { id: 'gotyme', label: 'GoTyme', from: '#1a1400', to: '#050505', ink: '#ffffff', accent: '#f5c542', pattern: 'rings' },
  { id: 'maribank', label: 'MariBank', from: '#ff7a00', to: '#e05a00', ink: '#2a1200', accent: '#ffd0a6', pattern: 'none' },
  { id: 'cimb', label: 'CIMB', from: '#f01e28', to: '#8f0c12', ink: '#ffffff', accent: '#ffb3b8', pattern: 'none' },
  { id: 'generic', label: 'Generic', from: '#2b2b2e', to: '#151516', ink: '#ffffff', accent: '#c9c9cf', pattern: 'none' }
]

export const WALLET_STYLE_IDS = WALLET_STYLE_PRESETS.map((preset) => preset.id)

export const DEFAULT_WALLET = { name: 'Cash', type: 'cash', style: 'cash' }

// Add-wallet grouped select. `style` is the persisted face; `other` uses the
// custom colour/image path instead of a preset.
export const WALLET_PROVIDER_GROUPS = [
  {
    label: 'Cash',
    options: [{ id: 'cash', label: 'Cash', type: 'cash', style: 'cash' }]
  },
  {
    label: 'Banks',
    options: [
      { id: 'bdo', label: 'BDO', type: 'bank', style: 'bdo' },
      { id: 'bpi', label: 'BPI', type: 'bank', style: 'bpi' },
      { id: 'metrobank', label: 'Metrobank', type: 'bank', style: 'metrobank' },
      { id: 'unionbank', label: 'UnionBank', type: 'bank', style: 'unionbank' },
      { id: 'securitybank', label: 'Security Bank', type: 'bank', style: 'securitybank' },
      { id: 'rcbc', label: 'RCBC', type: 'bank', style: 'rcbc' },
      { id: 'landbank', label: 'Landbank', type: 'bank', style: 'landbank' },
      { id: 'pnb', label: 'PNB', type: 'bank', style: 'pnb' },
      { id: 'psbank', label: 'PSBank', type: 'bank', style: 'psbank' }
    ]
  },
  {
    label: 'E-wallets',
    options: [
      { id: 'gcash', label: 'GCash', type: 'ewallet', style: 'gcash' },
      { id: 'maya', label: 'Maya', type: 'ewallet', style: 'maya' },
      { id: 'gotyme', label: 'GoTyme', type: 'ewallet', style: 'gotyme' },
      { id: 'maribank', label: 'MariBank', type: 'ewallet', style: 'maribank' },
      { id: 'cimb', label: 'CIMB', type: 'ewallet', style: 'cimb' }
    ]
  },
  {
    label: 'Other',
    options: [{ id: 'other', label: 'Other wallet', type: 'other', style: 'custom' }]
  }
]

export const WALLET_PROVIDERS = WALLET_PROVIDER_GROUPS.reduce((all, group) => {
  for (const option of group.options) all[option.id] = option
  return all
}, {})

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const CARD_IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/
export const MAX_CARD_IMAGE_CHARS = 400_000

export function validateColor(value) {
  const color = String(value ?? '').trim().toLowerCase()
  assert(COLOR_PATTERN.test(color), 'colour must be a #rrggbb value')
  return color
}

export function validateCardImage(value) {
  if (value === undefined || value === null || value === '') return null
  const image = String(value)
  assert(image.length <= MAX_CARD_IMAGE_CHARS, 'card image is too large')
  assert(CARD_IMAGE_PATTERN.test(image), 'card image must be a PNG, JPEG or WebP data URL')
  return image
}

// WCAG relative luminance (sRGB-linearised), threshold 0.179 for 4.5:1 against
// white/black.
export function contrastInk(hex) {
  const color = validateColor(hex)
  const channel = (value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const n = Number.parseInt(color.slice(1), 16)
  const r = channel((n >> 16) & 255)
  const g = channel((n >> 8) & 255)
  const b = channel(n & 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.179 ? '#1b1b1b' : '#ffffff'
}

function validateWalletType(value) {
  assert(WALLET_TYPES.includes(value), 'wallet type is not recognized')
  return value
}

function validateWalletStyle(value) {
  assert(value === 'custom' || WALLET_STYLE_IDS.includes(value), 'wallet style is not recognized')
  return value
}

const INTEREST_CREDITING = ['daily', 'monthly', 'quarterly', 'yearly']

function validateInterest(payload, type) {
  // Cash is the required spending wallet; it never earns interest.
  const enabled = type !== 'cash' && Boolean(payload.interest_enabled)
  const rate = Number(payload.interest_rate ?? 0)
  assert(Number.isFinite(rate) && rate >= 0 && rate <= 100, 'interest rate must be between 0 and 100')
  const crediting = INTEREST_CREDITING.includes(payload.interest_crediting)
    ? payload.interest_crediting
    : 'monthly'
  return {
    interest_enabled: enabled ? 1 : 0,
    interest_rate: enabled ? rate : 0,
    interest_crediting: enabled ? crediting : 'monthly',
    interest_withholding: enabled ? (payload.interest_withholding === false ? 0 : 1) : 1
  }
}

export function validateWalletId(value) {
  return validateId(value, 'wallet_id')
}

export function validateWalletInput(payload = {}) {
  const name = validateText(payload.name, 'name', { required: true, max: 60 })
  const type = validateWalletType(payload.type ?? 'cash')
  const style = validateWalletStyle(payload.style ?? 'generic')
  const opening = validateAmount(payload.opening_balance ?? 0, 'opening balance', { allowZero: true })
  const rawLast4 = String(payload.last4 ?? '').trim()
  assert(rawLast4 === '' || /^\d{4}$/.test(rawLast4), 'last 4 must be four digits')
  const isCustom = style === 'custom'
  const color = isCustom ? validateColor(payload.color || '#3b3b40') : null
  const cardImage = isCustom ? validateCardImage(payload.card_image) : null

  return {
    name,
    type,
    style,
    opening_balance: opening,
    last4: rawLast4 || null,
    color,
    card_image: cardImage,
    ...validateInterest(payload, type)
  }
}

export function validateTransferInput(payload = {}) {
  const fromId = validateId(payload.from_wallet_id, 'from_wallet_id')
  const toId = validateId(payload.to_wallet_id, 'to_wallet_id')
  assert(fromId !== toId, 'Choose two different wallets')
  const amount = validateAmount(payload.amount, 'amount')
  const date = validateDate(payload.date, 'date')
  const notes = validateText(payload.notes, 'notes', { max: 500 })
  return { from_wallet_id: fromId, to_wallet_id: toId, amount, date, notes }
}

// Pure balance math. Callers pass only active rows (archived rows are excluded
// by the repository query, including payments of archived debts).
export function computeWalletBalances({ wallets = [], income = [], expenses = [], debts = [], payments = [], transfers = [] } = {}) {
  const cents = new Map(wallets.map((wallet) => [wallet.id, toCents(wallet.opening_balance)]))
  const add = (walletId, value) => {
    if (walletId != null && cents.has(walletId)) cents.set(walletId, cents.get(walletId) + value)
  }

  for (const row of income) add(row.wallet_id, toCents(row.amount))
  for (const row of expenses) add(row.wallet_id, -toCents(row.amount))
  for (const row of debts) add(row.wallet_id, toCents(row.total_amount))
  for (const row of payments) add(row.wallet_id, -toCents(row.amount))
  for (const row of transfers) {
    add(row.from_wallet_id, -toCents(row.amount))
    add(row.to_wallet_id, toCents(row.amount))
  }

  const rows = wallets.map((wallet) => ({
    ...wallet,
    balance: fromCents(cents.get(wallet.id))
  }))
  const total = fromCents(rows.reduce((sum, wallet) => sum + toCents(wallet.balance), 0))
  const byId = rows.reduce((map, wallet) => {
    map[wallet.id] = wallet
    return map
  }, {})

  return { wallets: rows, total, byId }
}

export function summarizeWallets(walletRows = [], outstandingDebtCents = 0) {
  const balanceCents = walletRows.reduce((sum, wallet) => sum + toCents(wallet.balance), 0)
  return {
    netBalance: fromCents(balanceCents),
    liabilities: fromCents(outstandingDebtCents),
    netWorth: fromCents(balanceCents - outstandingDebtCents)
  }
}
