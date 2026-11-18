# Changelog

All notable changes to PocketVault are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Savings buckets** — goals and sinking funds share the existing
  contribution ledger, with an optional source wallet and a Goal/Sinking label.
- **Recurring bills** — bills, subscriptions and recurring income with a
  frequency, next due date and reminder lead; Post now creates exactly one
  income/expense row and advances the next date; Skip advances without posting.
- **Bills & Debts hub** — Debts, Bills, a due-date Calendar and a read-only
  Payoff view (smallest or largest balance first; uses monthly payments, not APR).
- **Credit cards** — credit limit, statement day, due day, minimum payment and
  APR; balances show as Owed with utilization, and count toward liabilities.
- **Track-only accounts** — record history without affecting net worth; they
  cannot be used for transfers.
- **Archive** now includes recurring bills and subscriptions.
- **CSV import** - review a file before writing, map wallets by name with a Cash
  fallback, skip invalid rows, and import income/expenses in one pass.
- **Reconciliation** - mark income and expenses as cleared or uncleared from the
  row menu; the list shows the status. It is a flag only and never moves money.

### Changed

- Schema **V9** adds credit-card fields; schema **V8** adds savings-bucket
  metadata and `recurring_rules`; schema **V10** adds reconciliation flags to
  income and expenses; schema **V11** adds `budgets.rollover` and
  `net_worth_snapshots`.
- Backups use **format 8**; format 7 and older still import, with credit fields
  defaulting to zero, reconciliation uncleared, and recurring rules absent from
  older files.
- Schema **V11 / backup v8**: budgets can roll unused money into the next month
  (carry is skipped for a budget created in the current month); the dashboard
  captures a daily net-worth snapshot and shows the 30-day change. Snapshots are
  derived and cleared by delete-all/import, so they are not backed up.

### Notes

- V8/V9/V10/V11 are one-way: older builds cannot read a database upgraded by
  this release.
- Recurring rules post only when confirmed; there is no automatic bank posting.
- Credit-card math uses the card balance and APR is stored for planning; the
  payoff view does not compound interest yet.

## [1.1.4] - 2026-11-18

### Added

- Mobile app shell for phones/tablets: fixed bottom tabs (Home, Wallet, center
  quick-add, Reports, More), a grouped More page, and a quick-add sheet.
- Optional wallet interest on money accounts: rate, crediting frequency and 20%
  withholding; the UI shows a monthly estimate and never posts a transaction.
- Cash uses the Monogram face (charcoal/gold, ₱ watermark, no chip); the old
  leather illustration is retired.

### Fixed

- New entries now default to Cash by **wallet type**, not the name, so renaming
  Cash no longer sends entries to another wallet.
- Cash always keeps its Monogram face; imports and legacy rows cannot turn it
  into a custom/preset card.
- Backup import finds Cash by type and normalizes wallet rows, so a renamed Cash
  no longer creates a duplicate Cash.
- Quick-add forms wait for the wallet list before opening, preventing default
  wallet resets and lost input.
- Android shows the status bar and insets the WebView below it; the top bar and
  bottom tabs no longer draw underneath system UI.
- Quick-add now traps and restores focus, exposes `aria-expanded`/`aria-controls`
  and locks background scrolling.
- Hidden Cash interest fields are ignored instead of leaking into the saved row.
- Android encrypted backup export writes valid base64 data, treats a cancelled
  share sheet as success, and the resulting `.pvbak` decrypts correctly.
- Mobile E2E registration/wallet setup is stable and covered.

### Changed

- **Encrypted backups** - export writes a password-protected `.pvbak` (PBKDF2-SHA256 + AES-256-GCM); legacy `.zip` backups still import.
- **Collapsible desktop sidebar** - collapses to a 76px icon rail with Ctrl/Cmd+B or the header toggle.
- The hamburger and mobile drawer are removed; desktop keeps the sidebar.
- iOS-style grouped surfaces: `#f2f2f7` light ground with white cards, true-black
  dark ground with `#1c1c1e` cards, capsule buttons, filled inputs and larger page
  titles. Wallet figures stack on phones without ellipsis; cards are one per row
  below 480px and the monogram/balance stay inside the card.
- Schema **V7** adds wallet interest fields; backups use **format 4** and still
  import v2/v3.
- Brand palette notes from official bank/digital/e-wallet product pages are in
  `docs/superpowers/plans/2026-11-18-account-catalog-and-mobile-nav.md`.

### Tests

- 134 unit, 371 smoke (61 db / 42 backup / 205 audit / 63 Capacitor), 23 stress,
  4 Electron E2E including a 390×844 mobile shell, lint and production build.

## [1.1.3] - 2026-11-17

### Added

- **Monogram wallet cards** — each bank/e-wallet preset carries a large, low-alpha
  initials watermark; Cash uses ₱ and a custom colour uses the wallet's initials.
- **Grouped sidebar navigation** — Overview, Money, Review and System sections on
  desktop and in the mobile drawer, with Settings separated at the bottom.
- **Type-first Add wallet** — Wallet type is chosen first; Bank offers only banks,
  E-wallet only e-wallets, and Other exposes the colour/image controls.
- **Fullscreen Android shell** — the status bar is hidden by default on launch and
  resumes, and can be revealed temporarily with an edge swipe.
- **Versioned installers** — Windows artifacts are `PocketVault-<version>.exe` /
  `.msi`; Android artifacts are `PocketVault-<version>.apk` /
  `PocketVault-<version>-debug.apk`.

### Changed

- **Blackout dark palette** — true-black page, near-black surfaces, and quieter
  rules/borders across the shell, cards, modals and charts.
- **Required Cash wallet** — the default Cash wallet cannot be archived and its
  type cannot change. New wallets default to the Cash type with a blank name.
- **Duplicate wallet guard** — wallet name + type must be unique
  (case-insensitive, trimmed), enforced on create, update and restore on desktop
  and Android.

### Tests

- 123 unit tests, 366 smoke checks (61 db, 41 backup, 202 audit, 62 Capacitor),
  23 stress checks and 3 Electron E2E/axe checks.

### Notes

- No schema or backup-format changes; backups remain **format 3**.
- The hidden status bar and fullscreen layout still need a device/emulator check.

## [1.1.2] - 2026-11-17

### Fixed

- Wallet transfers can now be archived from Wallet Activity and restored from the
  Archive page; the Archive → Transfers section is populated.
- Archive restore surfaces real errors instead of reporting every failure as
  "already restored" (desktop and Android).
- Hidden balances no longer leak through transfer pickers, the after-transfer
  preview, the activity archive confirmation, or the wallet archive confirmation.
- Archived wallets keep their real name in income/expense rows and in the edit
  pickers for those records, including the debt form.
- Transfer is unavailable when only one active wallet exists instead of opening an
  unusable form.
- Wallet and transfer forms attach validation errors to the correct field; the
  wallet archive message now describes negative balances accurately.
- Unknown legacy card styles fall back to the generic face.
- Moving wallets works when an imported backup contains tied sort orders.
- Transfers cannot target an archived wallet.
- Savings contributions cannot expose or link another account's income.
- Delete-all clears scheduled debt reminders.
- The wallet percentage finding is hidden when a balance is negative.

### Tests

- Regression coverage for the audit fixes: 119 unit tests, 360 smoke checks,
  23 large-data stress checks and 3 Electron E2E/axe checks.

### Notes

- No schema or backup-format changes; backups remain **format 3**.

## [1.1.1] - 2026-11-17

### Fixed

- Wallet form now opens an unrecognised stored face as **Other/custom** instead of
  leaving an inconsistent preset style.
- `useApiData` no longer keeps a stale loader after its dependencies change, so a
  reload cannot show data from a previous filter/wallet.
- Transfer form resets correctly when the wallet list changes.
- Category validation no longer over-escapes the hyphen.
- WCAG AA contrast for primary buttons and light-mode toasts (success, error,
  warning and info).

### Added

- Unit and component tests (Vitest + Testing Library), Electron E2E with axe
  accessibility checks, stress-test performance budgets, ESLint, CI test
  workflows and Dependabot. Coverage is 100% statements/lines/functions and
  99.79% branches for shared logic and the wallet UI.

### Notes

- No schema or backup-format changes; backups remain **format 3**.

## [1.1.0] - 2026-11-17

### Added

- **Wallets** — cash, bank cards and e-wallets with a card grid, net worth,
  net balance, assets and liabilities. Balances are derived from transactions,
  never stored.
- **Wallet transfers** between accounts, with a transfer history and restore.
- **Required wallet** on income, expenses, debt proceeds and debt payments.
  Cash is created for every account and is the catch-all default; legacy rows
  are migrated to it.
- **16 card faces** for Cash, BDO, BPI, Metrobank, UnionBank, Security Bank,
  RCBC, Landbank, PNB, PSBank, GCash, Maya, GoTyme, MariBank and CIMB, plus a
  generic face.
- **Custom wallet face** — pick a colour or upload a card image (downscaled and
  stored with the wallet).
- **Wallet activity** — merged income, expenses, loan proceeds, debt payments
  and transfers, loading 100 rows at a time up to 500.
- Wallets and transfers in the Archive page, with restore.
- Wallet column in income/expense lists and wallet pickers in every money form.

### Changed

- **Midnight dark palette** replaces the previous blue-grey dark theme. Light
  mode is unchanged.
- Wallet page navigation and phone/tablet layouts use the existing app shell.
- Backups use **format v3** (wallets + transfers). v2 backups still import and
  are assigned to Cash.

### Fixed

- Wallet activity labels expense rows with their category.
- Wallet activity no longer stops silently at 100 rows.

### Notes

- Schema **V6 is one-way**: older builds cannot read a database upgraded by
  1.1.0. Export a backup before downgrading.
- The last active wallet cannot be archived. Archiving a wallet with a balance
  removes that balance from net worth until it is restored.
- Custom card images are stored inline (≤ 400k characters), so they enlarge the
  wallet row and every backup.

## [1.0.0] - 2026-10-11

First public release: local multi-user income, expenses, debts, budgets,
savings goals, reports, receipts, per-account backups, light/dark themes,
multi-currency support, CSV/PDF export, and Windows/Android installers.

[1.1.4]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.1.4
[1.1.3]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.1.3
[1.1.2]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.1.2
[1.1.1]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.1.1
[1.1.0]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.1.0
[1.0.0]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.0.0
