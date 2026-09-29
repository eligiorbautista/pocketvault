# PocketVault

Offline-first personal finance tracker for **desktop and Android** — one React app,
built with Electron (desktop) and Capacitor (Android), storing everything in SQLite.
All data stays on your machine or device; no internet, cloud, telemetry, or accounts
are required.

## Features

- **Multi-user, local** — register/login per device; passwords hashed with bcrypt.
- **Income** — manual entry, optional receipt (image/PDF) attach, view, edit, delete.
- **Expenses** — categorised, editable, filter by category/date/keyword.
- **Debts** — no-schedule / fixed-date / monthly plans, flexible payments, re-borrow.
  The list shows paid progress at a glance; the detail view has a transaction-history
  timeline (payments vs re-borrows) and prefills the amount for monthly installments.
- **Budgets** — monthly limit per category with progress bars and over-budget alerts.
- **Savings** — goals, contributions (linkable to an income record), progress.
- **Reports** — monthly/yearly summaries with charts, PDF and CSV export.
- **Dashboard** — totals and recent activity, filterable by **month, custom date range,
  or all records**.
- **Backups (desktop)** — export/import a per-account ZIP (that account's data + receipts
  only). Importing never touches other accounts.
- **Currency** — pick any ISO 4217 currency (Philippine Peso by default) with correct symbols.
- **Custom categories** — add your own expense/budget categories beyond the defaults.
- **Responsive** — mobile-first UI from 320px to ultrawide; data tables collapse into
  stacked cards on phones.

## Platforms

| Platform | Runtime | Database | Files |
| --- | --- | --- | --- |
| Desktop (Windows/macOS/Linux) | Electron | `better-sqlite3` (main process) | `userData` dir |
| Android | Capacitor 8 | `@capacitor-community/sqlite` | `@capacitor/filesystem` |

The renderer never branches on the platform: it talks to one `api` facade
(`src/renderer/src/lib/api.js`) that resolves to the Electron IPC bridge or to the
Capacitor SQLite/Filesystem adapter. Both use the **same schema** (`src/shared/schema.js`).

## Tech stack

Electron · electron-vite (Vite 7) · React 19 · React Router · Zustand · Tailwind CSS v4 ·
better-sqlite3 · Capacitor 8 (`@capacitor-community/sqlite`, `@capacitor/filesystem`) ·
bcryptjs · react-hook-form · Recharts · date-fns · jsPDF · JSZip · sonner · lucide-react.

## Requirements

- Node.js **>= 22** and npm.
- Desktop: Windows/macOS/Linux.
- Android build (optional): the Android SDK with **platform/build-tools 36** and a
  **JDK 21** to run Gradle. Gradle auto-provisions the JDK 21 toolchain (Foojay resolver);
  `build-capacitor.sh` finds a suitable JDK for you.

## Run locally (no install needed)

```powershell
npm install
npm run dev            # or: npm run dev:desktop
```

`npm run dev` launches the Electron app with hot reload. The renderer dev server is pinned
to `http://127.0.0.1:4321` (set in `electron.vite.config.mjs`), because Windows can reserve
the `5173-5657` range for Docker/WSL, which makes Vite fail with `EACCES`. If `4321` is ever
taken, change `server.port` in that file.

> Note: `npm install` runs a `postinstall` that rebuilds native deps and ensures the
> Electron binary is present. If it was skipped by npm's script gating, run:
> `node node_modules/electron/install.js`

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `npm run dev:desktop` | Run the Electron app with hot reload |
| `npm run build` | Build main / preload / renderer bundles into `out/` |
| `npm run start` | Preview the production build |
| `npm test` | All smoke tests (db + backup + audit + capacitor) |
| `npm run icons` | Render the "PV" monogram logo (desktop icons + favicon + Android source layers) |
| `npm run build:desktop` | Package the desktop app with electron-builder |
| `npm run build:win` / `build:mac` / `build:linux` | Per-OS installers → `installers/<os>/` |
| `./build-electron.sh [win\|mac\|linux\|all]` | Auto-detect host OS and package it |
| `npm run dev:mobile` | Build the web app and `cap sync` Android |
| `npm run build:mobile` | Build + sync the Android project |
| `npm run cap:sync` / `npm run cap:open` | Sync / open the native Android project |
| `npm run assets` | Regenerate Android icons + splash from `assets/icon.png` |
| `./build-capacitor.sh [debug\|release]` | Build a **signed** APK → `installers/android/PocketVault.apk` |

Cross-building macOS/Linux installers is only reliable on the matching OS or in CI.

## Android build

```bash
sh build-capacitor.sh            # signed release APK (default)
sh build-capacitor.sh debug      # debug APK (signed with the debug key)
```

The script builds the web app, regenerates icons/splash, runs `cap sync`, compiles with
Gradle, copies the APK to `installers/android/`, and verifies its signature.

- The app is read from `capacitor.config.json`, so the release artifact is
  `installers/android/PocketVault.apk` (debug: `PocketVault-debug.apk`).
- Release builds are signed with `release.keystore` (generated on first run, **gitignored**).
  **Keep that file safe** — Android needs the same key to update an installed app.
- To use your own signing details, add a gitignored `keystore.properties` at the repo root
  (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`).

## Project structure

```
src/
  shared/            schema (DDL), validation, dates, money, currency, constants
  main/              Electron main process
    db/              connection, schema/migrations, validation, repositories
    services/        receipts + backup (ZIP) handling
    ipc/             validated IPC handlers (one module per domain)
  preload/           contextBridge API exposed as window.api
  renderer/          React app (routed pages, components, stores)
    src/lib/api.js          unified DatabaseAdapter facade used by the whole app
    src/lib/platform.js     Electron vs Capacitor detection
    src/lib/capacitor/      Android adapter (SQLite + Filesystem)
android/             Capacitor Android project (native shell, icons, splash)
assets/              master app logo used to generate Android icons/splash
scripts/
  db-smoke.mjs / backup-smoke.mjs / audit-smoke.mjs   repository + service tests
  capacitor-smoke.mjs  runs the Android adapter against a real SQLite engine
  generate-icon.mjs    "PV" monogram logo / icon generator (sharp)
build/               app icons for electron-builder
capacitor.config.json
```

## Data locations

- **Desktop** — database `app.getPath('userData')/pocketvault.db`, receipts in
  `app.getPath('userData')/receipts/`; backups are written wherever you choose.
- **Android** — the SQLite database lives in the app's private storage; receipts and
  exports are written to the app's private data directory (no storage permission needed).

## Security model

- `contextIsolation: true`, `nodeIntegration: false` (desktop).
- The renderer only touches privileged functionality through the unified `api` adapter —
  Electron IPC on desktop, native SQLite/Filesystem on Android. It never calls
  `window.api` directly.
- The authenticated user id is tracked in the **main process** per renderer (desktop) or in
  an in-memory session (Android); handlers never trust a user id sent from the renderer.
- All SQL uses parameterised queries; all inputs are validated before writes.
- Optional "Require password on startup" (Settings → Security) disables silent session resume.
- A strict Content-Security-Policy is injected into the production `index.html`.

## Mobile notes

- Backup **export** on Android writes JSON to the app's private data directory; importing a
  backup from file is not implemented yet.
- Opening a receipt in the system viewer is not supported on Android (in-app preview works).
- Receipt upload uses the system file picker.

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
10. Switch the dashboard period between By month, Custom range, and All records.
11. Resize the window from 320px to 1920px and confirm the layout stays usable.
12. Run `sh build-capacitor.sh`, install `installers/android/PocketVault.apk` on a device/emulator, register, add records, and confirm data survives an app restart.
