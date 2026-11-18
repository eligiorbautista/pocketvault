import { toCents } from '../../../shared/money.js'
import {
  computeWalletBalances,
  summarizeWallets,
  validateTransferInput,
  validateWalletInput
} from '../../../shared/wallets.js'
import { ValidationError } from '../../../shared/validate.js'

const WALLET_COLUMNS =
  'id, user_id, name, type, style, opening_balance, last4, color, sort_order, is_archived, interest_enabled, interest_rate, interest_crediting, interest_withholding, created_at, updated_at'
const CARD_COLUMNS = `${WALLET_COLUMNS}, card_image`

export function list(db, userId) {
  return db
    .prepare(
      `SELECT ${WALLET_COLUMNS} FROM wallets
       WHERE user_id = ? AND is_archived = 0
       ORDER BY sort_order ASC, id ASC`
    )
    .all(userId)
}

// The Wallet page needs the face image; pickers use `list` so base64 never
// travels through every form.
export function cards(db, userId) {
  return db
    .prepare(
      `SELECT ${CARD_COLUMNS} FROM wallets
       WHERE user_id = ? AND is_archived = 0
       ORDER BY sort_order ASC, id ASC`
    )
    .all(userId)
}

export function getById(db, userId, id) {
  return (
    db
      .prepare(`SELECT ${CARD_COLUMNS} FROM wallets WHERE id = ? AND user_id = ?`)
      .get(id, userId) ?? null
  )
}

export function listArchived(db, userId) {
  return db
    .prepare(
      `SELECT ${WALLET_COLUMNS} FROM wallets
       WHERE user_id = ? AND is_archived = 1
       ORDER BY sort_order ASC, id ASC`
    )
    .all(userId)
}

export function ensureWallet(db, userId, id) {
  const wallet = db
    .prepare('SELECT id, user_id, name, type, style, is_archived FROM wallets WHERE id = ? AND user_id = ?')
    .get(id, userId)
  if (!wallet) throw new ValidationError('Wallet not found')
  return wallet
}

function ensureActiveWallet(db, userId, id) {
  const wallet = ensureWallet(db, userId, id)
  if (wallet.is_archived) throw new ValidationError('Wallet is archived')
  return wallet
}

function defaultCash(db, userId) {
  return (
    db
      .prepare(
        "SELECT id FROM wallets WHERE user_id = ? AND type = 'cash' ORDER BY sort_order ASC, id ASC LIMIT 1"
      )
      .get(userId) ?? null
  )
}

function ensureUniqueWallet(db, userId, name, type, excludeId = 0) {
  const duplicate = db
    .prepare(
      `SELECT id FROM wallets
       WHERE user_id = ? AND type = ? AND lower(trim(name)) = lower(trim(?)) AND id <> ?
       LIMIT 1`
    )
    .get(userId, type, name, excludeId)
  if (duplicate) {
    throw new ValidationError('A wallet with this name and type already exists')
  }
}

export function create(db, userId, payload) {
  const data = validateWalletInput(payload)
  ensureUniqueWallet(db, userId, data.name, data.type)
  const next = db
    .prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM wallets WHERE user_id = ?')
    .get(userId).next
  const info = db
    .prepare(
      `INSERT INTO wallets
        (user_id, name, type, style, opening_balance, last4, color, card_image, sort_order,
         interest_enabled, interest_rate, interest_crediting, interest_withholding, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run(
      userId,
      data.name,
      data.type,
      data.style,
      data.opening_balance,
      data.last4,
      data.color,
      data.card_image,
      next,
      data.interest_enabled,
      data.interest_rate,
      data.interest_crediting,
      data.interest_withholding
    )
  return getById(db, userId, info.lastInsertRowid)
}

export function update(db, userId, id, payload) {
  const current = getById(db, userId, id)
  if (!current) return null
  const data = validateWalletInput(payload)
  const cash = defaultCash(db, userId)
  if (cash?.id === id && data.type !== 'cash') {
    throw new ValidationError('The default Cash wallet must stay a cash wallet')
  }
  ensureUniqueWallet(db, userId, data.name, data.type, id)
  db.prepare(
    `UPDATE wallets
     SET name = ?, type = ?, style = ?, opening_balance = ?, last4 = ?, color = ?, card_image = ?,
         interest_enabled = ?, interest_rate = ?, interest_crediting = ?, interest_withholding = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).run(
    data.name,
    data.type,
    data.style,
    data.opening_balance,
    data.last4,
    data.color,
    data.card_image,
    data.interest_enabled,
    data.interest_rate,
    data.interest_crediting,
    data.interest_withholding,
    id,
    userId
  )
  return getById(db, userId, id)
}

export function remove(db, userId, id) {
  if (defaultCash(db, userId)?.id === id) {
    throw new ValidationError('The default Cash wallet cannot be archived')
  }
  const active = db
    .prepare('SELECT COUNT(*) AS count FROM wallets WHERE user_id = ? AND is_archived = 0')
    .get(userId).count
  if (active <= 1) throw new ValidationError('At least one wallet must stay active')
  return (
    db
      .prepare(
        'UPDATE wallets SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0'
      )
      .run(id, userId).changes > 0
  )
}

export function restore(db, userId, id) {
  const archived = db
    .prepare('SELECT name, type FROM wallets WHERE id = ? AND user_id = ? AND is_archived = 1')
    .get(id, userId)
  if (!archived) return false
  ensureUniqueWallet(db, userId, archived.name, archived.type, id)
  return (
    db
      .prepare(
        'UPDATE wallets SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1'
      )
      .run(id, userId).changes > 0
  )
}

export function move(db, userId, id, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw new ValidationError('direction must be up or down')
  }
  const rows = list(db, userId)
  const index = rows.findIndex((wallet) => wallet.id === id)
  if (index === -1) return false
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= rows.length) return false

  // Rewrite the whole active order instead of swapping two sort_order values:
  // backups can contain tied or sparse values, and a swap would then be a no-op.
  const ordered = rows.map((wallet) => wallet.id)
  ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
  const update = db.prepare('UPDATE wallets SET sort_order = ? WHERE id = ?')
  const run = db.transaction(() => {
    ordered.forEach((walletId, position) => update.run(position, walletId))
  })
  run()
  return true
}

export function balances(db, userId) {
  const wallets = list(db, userId)
  const income = db
    .prepare('SELECT amount, wallet_id FROM income WHERE user_id = ? AND is_archived = 0')
    .all(userId)
  const expenses = db
    .prepare('SELECT amount, wallet_id FROM expenses WHERE user_id = ? AND is_archived = 0')
    .all(userId)
  const debts = db
    .prepare(
      'SELECT total_amount, wallet_id FROM debts WHERE user_id = ? AND is_archived = 0 AND wallet_id IS NOT NULL'
    )
    .all(userId)
  const payments = db
    .prepare(
      `SELECT p.amount, p.wallet_id
       FROM debt_payments p
       JOIN debts d ON d.id = p.debt_id
       WHERE d.user_id = ? AND d.is_archived = 0 AND p.wallet_id IS NOT NULL`
    )
    .all(userId)
  const transfers = db
    .prepare(
      `SELECT amount, from_wallet_id, to_wallet_id
       FROM wallet_transfers WHERE user_id = ? AND is_archived = 0`
    )
    .all(userId)

  return computeWalletBalances({ wallets, income, expenses, debts, payments, transfers })
}

export function summary(db, userId) {
  const result = balances(db, userId)
  const images = new Map(cards(db, userId).map((wallet) => [wallet.id, wallet.card_image]))
  const wallets = result.wallets.map((wallet) => ({
    ...wallet,
    card_image: images.get(wallet.id) ?? null
  }))
  const outstanding = db
    .prepare(
      'SELECT COALESCE(SUM(remaining_amount), 0) AS total FROM debts WHERE user_id = ? AND is_archived = 0'
    )
    .get(userId).total
  return {
    wallets,
    total: result.total,
    ...summarizeWallets(wallets, toCents(outstanding))
  }
}

export function activity(db, userId, walletId, limit = 100) {
  const rows = db
    .prepare(
      `SELECT * FROM (
        SELECT 'income' AS kind, id, date AS date, amount AS amount, COALESCE(source, '') AS label,
               notes, NULL AS from_name, NULL AS to_name
        FROM income WHERE user_id = ? AND wallet_id = ? AND is_archived = 0
        UNION ALL
        SELECT 'expense', id, date, -amount, category, notes, NULL, NULL
        FROM expenses WHERE user_id = ? AND wallet_id = ? AND is_archived = 0
        UNION ALL
        SELECT 'loan', d.id, COALESCE(substr(d.created_at, 1, 10), d.due_date, ''), d.total_amount,
               d.creditor, d.notes, NULL, NULL
        FROM debts d WHERE d.user_id = ? AND d.wallet_id = ? AND d.is_archived = 0
        UNION ALL
        SELECT 'payment', p.id, p.date, -p.amount, 'Debt payment', p.notes, NULL, NULL
        FROM debt_payments p JOIN debts d ON d.id = p.debt_id
        WHERE d.user_id = ? AND p.wallet_id = ? AND d.is_archived = 0
        UNION ALL
        SELECT 'transfer', t.id, t.date, -t.amount, 'Transfer out', t.notes, fw.name, tw.name
        FROM wallet_transfers t
        JOIN wallets fw ON fw.id = t.from_wallet_id
        JOIN wallets tw ON tw.id = t.to_wallet_id
        WHERE t.user_id = ? AND t.from_wallet_id = ? AND t.is_archived = 0
        UNION ALL
        SELECT 'transfer', t.id, t.date, t.amount, 'Transfer in', t.notes, fw.name, tw.name
        FROM wallet_transfers t
        JOIN wallets fw ON fw.id = t.from_wallet_id
        JOIN wallets tw ON tw.id = t.to_wallet_id
        WHERE t.user_id = ? AND t.to_wallet_id = ? AND t.is_archived = 0
      )
      ORDER BY date DESC, id DESC
      LIMIT ?`
    )
    .all(
      userId,
      walletId,
      userId,
      walletId,
      userId,
      walletId,
      userId,
      walletId,
      userId,
      walletId,
      userId,
      walletId,
      limit
    )
  return rows
}

export function getTransfer(db, userId, id) {
  return (
    db
      .prepare(
        `SELECT t.*, fw.name AS from_name, tw.name AS to_name
         FROM wallet_transfers t
         JOIN wallets fw ON fw.id = t.from_wallet_id
         JOIN wallets tw ON tw.id = t.to_wallet_id
         WHERE t.id = ? AND t.user_id = ?`
      )
      .get(id, userId) ?? null
  )
}

export function transfer(db, userId, payload) {
  const data = validateTransferInput(payload)
  ensureActiveWallet(db, userId, data.from_wallet_id)
  ensureActiveWallet(db, userId, data.to_wallet_id)
  const info = db
    .prepare(
      `INSERT INTO wallet_transfers
        (user_id, from_wallet_id, to_wallet_id, amount, date, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .run(
      userId,
      data.from_wallet_id,
      data.to_wallet_id,
      data.amount,
      data.date,
      data.notes
    )
  return getTransfer(db, userId, info.lastInsertRowid)
}

export function removeTransfer(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE wallet_transfers SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 0'
      )
      .run(id, userId).changes > 0
  )
}

export function restoreTransfer(db, userId, id) {
  return (
    db
      .prepare(
        'UPDATE wallet_transfers SET is_archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_archived = 1'
      )
      .run(id, userId).changes > 0
  )
}

export function listArchivedTransfers(db, userId) {
  return db
    .prepare(
      `SELECT t.*, fw.name AS from_name, tw.name AS to_name
       FROM wallet_transfers t
       JOIN wallets fw ON fw.id = t.from_wallet_id
       JOIN wallets tw ON tw.id = t.to_wallet_id
       WHERE t.user_id = ? AND t.is_archived = 1
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(userId)
}
