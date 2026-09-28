# PocketVault

Offline-first personal finance tracker for desktop — Electron + React + SQLite.
All data lives on your machine; no internet, cloud, telemetry, or accounts are required.

## Features

- **Multi-user, local** — register/login per device; passwords hashed with bcrypt.
- **Income** — manual entry, optional receipt (image/PDF) attach, view, edit, delete.
- **Expenses** — categorised, editable, filter by category/date/keyword.
- **Debts** — no-schedule / fixed-date / monthly plans, flexible payments, re-borrow,
  balances and status tracking with a payment ledger.
- **Budgets** — monthly limit per category with progress bars and over-budget alerts.
- **Savings** — goals, contributions (linkable to an income record), progress.
- **Reports** — monthly/yearly summaries with charts, PDF and CSV export.
- **Backups** — export/import a per-account ZIP (that account's data + receipts only). Importing never touches other accounts.
- **Dashboard** — income, expenses, remaining balance, unpaid debts, budget/savings bars.
- **Responsive** — mobile-first UI from 375px up to ultrawide.

## Tech stack

Electron · electron-vite (Vite 7) · React 19 · React Router · Zustand · Tailwind CSS v4 ·
better-sqlite3 · bcryptjs · react-hook-form · Recharts · date-fns · jsPDF · JSZip · sonner · lucide-react.

## Requirements

- Node.js **>= 22**
- npm
- Windows/macOS/Linux desktop

## Run locally (no install needed)

```powershell
npm install
npm run dev
```

`npm run dev` launches the Electron app with hot reload. The renderer dev server is pinned
to `http://127.0.0.1:4321` (set in `electron.vite.config.mjs`), because Windows can reserve
the `5173-5657` range for Docker/WSL, which makes Vite fail with `EACCES`. If `4321` is ever
taken, change `server.port` in that file.

> Note: `npm install` runs a `postinstall` that rebuilds native deps and ensures the
> Electron binary is present. If it was skipped by npm's script gating, run:
> `node node_modules/electron/install.js`

## Other commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the app with hot reload |
| `npm run build` | Build main / preload / renderer bundles into `out/` |
| `npm run start` | Preview the production build |
| `npm run icons` | Regenerate `build/icon.png` and `build/icon.ico` |
| `npm run build:win` | Windows installer → `installers/windows/` |
| `npm run build:mac` | macOS `.dmg` → `installers/macos/` (macOS host) |
| `npm run build:linux` | Linux AppImage → `installers/linux/` (Linux host) |
| `./build-electron.sh` | Auto-detect host OS and package it into `installers/<os>/` |
| `./build-electron.sh detect` | Print the detected OS + output folder (no build) |
| `./build-electron.sh [win\|mac\|linux\|all]` | Force a target / attempt all |

Cross-building macOS/Linux installers is only reliable on the matching OS or in CI.

## Project structure

```
src/
  shared/            constants + money helpers (used by main and renderer)
  main/              Electron main process
    db/              connection, schema/migrations, validation, repositories
    services/        receipts + backup (ZIP) handling
    ipc/             validated IPC handlers (one module per domain)
  preload/           contextBridge API exposed as window.api
  renderer/          React app (routed pages, components, stores)
scripts/
  db-smoke.mjs         repository/DB verification harness
  generate-icon.mjs    dependency-free icon generator
build/               app icons for electron-builder
```

## Data locations

- Database: `app.getPath('userData')/pocketvault.db`
- Receipts: `app.getPath('userData')/receipts/`
- Backups are written wherever you choose in the export dialog.

## Security model

- `contextIsolation: true`, `nodeIntegration: false`.
- Renderer only touches privileged functionality through `window.api` (IPC).
- The authenticated user id is tracked in the **main process** (per renderer); data
  handlers never trust a user id sent from the renderer.
- All SQL uses parameterised queries; all inputs are validated before writes.
- Strict Content-Security-Policy is injected into the production `index.html`.

## Manual test checklist

1. Register a user, sign out, sign back in; confirm the session persists across restart.
2. Add income with a receipt, view the receipt, edit and delete the record.
3. Add expenses in several categories; filter by category/date/keyword.
4. Create a debt (each payment type), record payments, re-borrow, remove a ledger entry.
5. Set budgets and confirm the over-budget alert and progress bars.
6. Create a savings goal and add a contribution linked to an income record.
7. Open Reports, change the year, export both CSV and PDF.
8. In Settings, export a backup, then import it (only this account's data is replaced; you stay signed in).
9. Register a second user and confirm you cannot see the first user's data; also confirm a backup from the first account is refused when signed in as the second.
10. Resize the window from 375px to 1920px and confirm the layout stays usable.
