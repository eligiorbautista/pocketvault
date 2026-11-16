# Changelog

All notable changes to PocketVault are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[1.1.1]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.1.1
[1.1.0]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.1.0
[1.0.0]: https://github.com/eligiorbautista/pocketvault/releases/tag/v1.0.0
