# PocketVault — Agent Notes

Offline-first Electron + React + SQLite finance tracker. See `README.md` for user-facing docs.

## Commands

- Install: `npm install` (runs `postinstall`: `electron-builder install-app-deps` + ensures the Electron binary).
- Dev: `npm run dev` (Electron + hot reload). Renderer dev server is pinned to `127.0.0.1:4321` in `electron.vite.config.mjs`; on this machine Windows reserves the `5098-5657` range for Docker/WSL, so 5173 fails with `EACCES`.
- Build bundles: `npm run build` → `out/`.
- Preview build: `npm run start`.
- Package: `npm run build:win` / `build:mac` / `build:linux` (or `./build-electron.sh [win|mac|linux|all]`).
- Icons: `npm run icons` (regenerates `build/icon.png` + `build/icon.ico`, no deps).
- DB/repository smoke test (run from repo root):
  `npx esbuild scripts/db-smoke.mjs --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=".pv-smoke.cjs"; node .pv-smoke.cjs`
- Per-account backup isolation smoke test (run from repo root):
  `npx esbuild scripts/backup-smoke.mjs --bundle --platform=node --format=cjs --external:better-sqlite3 --external:jszip --outfile=".pv-backup-smoke.cjs"; node .pv-backup-smoke.cjs`
- Full CRUD/validation audit (run from repo root):
  `npx esbuild scripts/audit-smoke.mjs --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=".pv-audit.cjs"; node .pv-audit.cjs`
- All tests at once: `npm test` (runs `scripts/run-tests.mjs`: db + backup + audit).
- No ESLint/typecheck is configured.

## Architecture

- `src/main/db/connection.js` does **not** import Electron (testable with plain Node). Main injects `app.getPath('userData')`.
- Repositories take `db` as the first argument; keep them Electron-free.
- IPC: register handlers via `handle(channel, fn, { auth })` in `src/main/ipc/handle.js`. Responses are `{ ok, data }` / `{ ok, error }`; preload unwraps and throws on error.
- Auth session lives in the main process (`src/main/db/session.js`), keyed by `webContents.id`. Never trust a `userId` from the renderer.
- Renderer calls only `window.api.*` (defined in `src/preload/index.js`).

## Gotchas / decisions

- **Vite pinned to 7** (electron-vite 5 peer range excludes Vite 8). `@vitejs/plugin-react` pinned to 5.x for the same reason.
- **Tailwind v4** via `@tailwindcss/vite` — theme lives in `src/renderer/src/assets/main.css` (`@theme`), no `tailwind.config.js`/PostCSS.
- **CSP** is injected by `cspPlugin()` in `electron.vite.config.mjs` **only for production builds**, so Vite's dev/React-Refresh preamble works in dev.
- **Only `better-sqlite3` is in `dependencies`** (externalized/packaged); everything else is bundled from `devDependencies` to keep the package small.
- **better-sqlite3 v13 is N-API** (prebuilds in `node_modules/better-sqlite3/prebuilds/`), ABI-stable across Electron versions; `asarUnpack` keeps `*.node` outside the asar.
- **HashRouter** (not BrowserRouter) — production loads over `file://`.
- **Money**: stored as peso numbers in SQLite (schema compatibility) but every calculation uses integer centavos (`src/shared/money.js`).
- **Added table** `savings_contributions` beyond the original spec, to support "link contributions from income".
- **Backups are per-account** (format v2): export contains only the signed-in user's rows + their receipts; import is refused unless the backup's username matches the signed-in user, and replaces only that user's rows (other accounts untouched). Service: `src/main/services/backup.js`.
- **Currency**: `src/shared/currency.js` derives the full ISO 4217 list, names and symbols from `Intl`. Stored per user in `user_settings`; renderer reads it via `src/renderer/src/store/settingsStore.js`; `formatCurrency()` follows it.
- **Custom categories**: `validateCategory` accepts the built-in slugs or a custom label (pattern-validated); expense/budget forms offer a "Custom…" option.
- **Deletes are permanent**; "Delete all data" (Settings) wipes a user's rows/receipts but keeps the account. Optional "Require password on startup" lives in the same `user_settings` table.
- **Toasts** use `sonner`; `<Toaster richColors position="bottom-right" />` is mounted at the App root (so toasts survive redirects/logout). Call `toast(message, variant, options?)` from `src/renderer/src/store/uiStore.js`.
- **Dashboard period filter**: `src/renderer/src/components/ui/PeriodFilter.jsx` offers By month / Custom range / All records. Every period also resolves to a **budget month** (budgets are inherently monthly): month mode = that month, range = month containing the range's `to` date, all = current month; the UI labels this ("Budgets are monthly — showing …"). Repo: `dashboardRepo.getSummary(db, userId, period)` accepts a month string or `{ from, to, month }`.
- **`monthlyTotals(db, userId, period)`** accepts a year (always 12 buckets) or `{ from, to }` (contiguous buckets only across months that actually have data; labels switch to "MMM yy" when spanning years).
- Renderer bundle is large (~2.5 MB) because jsPDF/html2canvas and Recharts are eager; code-split `src/renderer/src/lib/export.js` if needed.
- `@electron/rebuild` is a devDependency for an explicit `npm run rebuild`; electron-builder already rebuilds native deps, so its warning is informational.
