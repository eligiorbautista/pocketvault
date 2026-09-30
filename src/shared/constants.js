export const CURRENCY = {
  code: 'PHP',
  symbol: '\u20B1',
  locale: 'en-PH'
}

export const PAGE_SIZE = 50

export const EXPENSE_CATEGORIES = [
  { value: 'food', label: 'Food & Dining' },
  { value: 'transport', label: 'Transportation' },
  { value: 'housing', label: 'Housing & Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'connectivity', label: 'Internet & Phone' },
  { value: 'health', label: 'Health' },
  { value: 'education', label: 'Education' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'family', label: 'Family & Support' },
  { value: 'investment', label: 'Savings & Investment' },
  { value: 'misc', label: 'Miscellaneous' }
]

export const EXPENSE_CATEGORY_VALUES = EXPENSE_CATEGORIES.map((c) => c.value)

export const INCOME_SOURCES = [
  'Salary',
  'Business',
  'Freelance',
  'Investments',
  'Gifts',
  'Refunds',
  'Other'
]

export const DEBT_PAYMENT_TYPES = [
  { value: 'no-schedule', label: 'No schedule' },
  { value: 'fixed-date', label: 'Fixed date' },
  { value: 'monthly', label: 'Monthly installment' }
]

export const DEBT_PAYMENT_TYPE_VALUES = DEBT_PAYMENT_TYPES.map((t) => t.value)

export const DEBT_STATUSES = ['unpaid', 'partial', 'paid', 'overdue']

export const DEBT_PAYMENT_KINDS = ['payment']

export const SESSION_STORAGE_KEY = 'pocketvault.session'

export const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const RECEIPT_FILE_PATTERN = /^[A-Za-z0-9-]+\.(png|jpe?g|webp|gif|pdf)$/i

export const RECEIPT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf']

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

// Upper bound on the total receipt payload inside a backup ZIP (both platforms).
export const MAX_BACKUP_RECEIPTS_BYTES = 100 * 1024 * 1024
