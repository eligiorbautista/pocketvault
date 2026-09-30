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

export const MIGRATIONS = [V1, V2, V3]
export const SCHEMA_VERSION = MIGRATIONS.length
