// Shared SQLite schema for PocketVault.
//
// This module is environment-agnostic on purpose: the Electron main process
// applies it through better-sqlite3 and the Capacitor (Android) build applies
// the exact same statements through @capacitor-community/sqlite. Keeping the
// DDL here guarantees both platforms create byte-for-byte identical databases.
//
// NOTE: one table was added beyond the original spec:
//   savings_contributions - required to satisfy the "link contributions from
//   income" feature for savings goals. It references savings_goals and,
//   optionally, income. savings_goals.current_amount is kept in sync on write.
//
// All other tables/columns match the specification exactly.

// v1 mirrors the PocketVault specification.
const V1 = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS income (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  source TEXT,
  notes TEXT,
  receipt_path TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  creditor TEXT NOT NULL,
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  remaining_amount REAL NOT NULL,
  due_date TEXT,
  payment_type TEXT DEFAULT 'no-schedule',
  monthly_amount REAL,
  payment_day INTEGER,
  status TEXT DEFAULT 'unpaid',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  payment_type TEXT DEFAULT 'payment',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  monthly_limit REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, category)
);

CREATE TABLE IF NOT EXISTS savings_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  goal_name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  current_amount REAL DEFAULT 0,
  deadline TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS savings_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL,
  income_id INTEGER,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE,
  FOREIGN KEY (income_id) REFERENCES income(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_income_user_date ON income (user_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses (user_id, category);
CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments (debt_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets (user_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user ON savings_goals (user_id);
CREATE INDEX IF NOT EXISTS idx_savings_contrib_goal ON savings_contributions (goal_id);
`

// v2: per-user preferences (currency, security options).
const V2 = `
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY,
  currency TEXT NOT NULL DEFAULT 'PHP',
  require_password_on_start INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`

// v3: soft delete / archive support. ALTER TABLE ADD COLUMN is not idempotent,
// so the migration runners tolerate the "duplicate column name" error (needed
// because the Capacitor runner re-runs migrations if the version probe fails).
const V3 = `
ALTER TABLE income ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE debts ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE budgets ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE savings_goals ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
`

// v4: debt enhancements - explicit first installment date for monthly debts,
// optional proof/receipt at the debt level AND per payment.
const V4 = `
ALTER TABLE debts ADD COLUMN first_payment_date TEXT;
ALTER TABLE debts ADD COLUMN receipt_path TEXT;
ALTER TABLE debt_payments ADD COLUMN installment_due TEXT;
ALTER TABLE debt_payments ADD COLUMN receipt_path TEXT;
`

// v5: debt payment reminders (per-user preference + lead time in days).
const V5 = `
ALTER TABLE user_settings ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN reminder_lead_days INTEGER NOT NULL DEFAULT 3;
`

// v6: wallets, transfers, and a wallet on every money movement. The backfill
// gives every existing user a Cash wallet and points legacy rows at it.
const V6 = `
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cash',
  style TEXT NOT NULL DEFAULT 'generic',
  opening_balance REAL NOT NULL DEFAULT 0,
  last4 TEXT,
  color TEXT,
  card_image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  from_wallet_id INTEGER NOT NULL,
  to_wallet_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (from_wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  FOREIGN KEY (to_wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets (user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_user ON wallet_transfers (user_id, date);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_wallets ON wallet_transfers (from_wallet_id, to_wallet_id);

ALTER TABLE income ADD COLUMN wallet_id INTEGER;
ALTER TABLE expenses ADD COLUMN wallet_id INTEGER;
ALTER TABLE debts ADD COLUMN wallet_id INTEGER;
ALTER TABLE debt_payments ADD COLUMN wallet_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_income_wallet ON income (wallet_id);
CREATE INDEX IF NOT EXISTS idx_expenses_wallet ON expenses (wallet_id);
CREATE INDEX IF NOT EXISTS idx_debts_wallet ON debts (wallet_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_wallet ON debt_payments (wallet_id);

INSERT INTO wallets (user_id, name, type, style, sort_order)
SELECT id, 'Cash', 'cash', 'cash',
       COALESCE((SELECT MAX(sort_order) + 1 FROM wallets w WHERE w.user_id = users.id), 0)
FROM users
WHERE NOT EXISTS (SELECT 1 FROM wallets w WHERE w.user_id = users.id AND w.name = 'Cash');

UPDATE income SET wallet_id = (SELECT w.id FROM wallets w WHERE w.user_id = income.user_id AND w.name = 'Cash')
WHERE wallet_id IS NULL;

UPDATE expenses SET wallet_id = (SELECT w.id FROM wallets w WHERE w.user_id = expenses.user_id AND w.name = 'Cash')
WHERE wallet_id IS NULL;

UPDATE debts SET wallet_id = (SELECT w.id FROM wallets w WHERE w.user_id = debts.user_id AND w.name = 'Cash')
WHERE wallet_id IS NULL;

UPDATE debt_payments
SET wallet_id = (
  SELECT w.id FROM wallets w
  JOIN debts d ON d.user_id = w.user_id
  WHERE d.id = debt_payments.debt_id AND w.name = 'Cash'
)
WHERE wallet_id IS NULL;
`

export const MIGRATIONS = [V1, V2, V3, V4, V5, V6]
export const SCHEMA_VERSION = MIGRATIONS.length
