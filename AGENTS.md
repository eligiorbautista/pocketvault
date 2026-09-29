# PocketVault — Agent Notes

Offline-first Electron + React + SQLite finance tracker. See `README.md` for user-facing docs.

## Commands

- Install: `npm install` (runs `postinstall`: `electron-builder install-app-deps` + ensures the Electron binary).
- Dev: `npm run dev` / `npm run dev:desktop` (Electron + hot reload). Renderer dev server is pinned to `127.0.0.1:4321` in `electron.vite.config.mjs`; on this machine Windows reserves the `5098-5657` range for Docker/WSL, so 5173 fails with `EACCES`.
- Build bundles: `npm run build` → `out/` (`out/renderer` is also the Capacitor `webDir`).
- Preview build: `npm run start`.
- Package desktop: `npm run build:desktop`, or per-OS `npm run build:win` / `build:mac` / `build:linux` (or `./build-electron.sh [win|mac|linux|all]`).
- Mobile / Capacitor: `npm run build:mobile` (= build + `cap sync android`), `npm run dev:mobile`, `npm run cap:sync`, `npm run cap:open`, `npm run assets` (regenerates Android icons/splash from `assets/icon.png`). Full signed APK build: `./build-capacitor.sh [debug|release]` (release is the default; it generates a gitignored `release.keystore` and verifies the signature) → `installers/android/`.
- Icons (desktop): `npm run icons` (regenerates `build/icon.png` + `build/icon.ico`, no deps).
- DB/repository smoke test (run from repo root):
  `npx esbuild scripts/db-smoke.mjs --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=".pv-smoke.cjs"; node .pv-smoke.cjs`
- Per-account backup isolation smoke test (run from repo root):
  `npx esbuild scripts/backup-smoke.mjs --bundle --platform=node --format=cjs --external:better-sqlite3 --external:jszip --outfile=".pv-backup-smoke.cjs"; node .pv-backup-smoke.cjs`
- Full CRUD/validation audit (run from repo root):
  `npx esbuild scripts/audit-smoke.mjs --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=".pv-audit.cjs"; node .pv-audit.cjs`
- Capacitor (Android data layer) smoke test: `node scripts/capacitor-smoke.mjs` — bundles `src/renderer/src/lib/capacitor/api.js` with its sqlite module swapped for a better-sqlite3 shim and exercises the whole adapter (no device/emulator needed).
- All tests at once: `npm test` (runs `scripts/run-tests.mjs`: db + backup + audit + capacitor).
- No ESLint/typecheck is configured.

## Architecture

- **Cross-platform (Electron desktop + Capacitor Android).** One React frontend builds to both. `capacitor.config.json` sets `webDir: "out/renderer"`; the native project lives in `android/`.
- **Adapter layer:** `src/renderer/src/lib/api.js` exposes a single `api` facade (a lazy Proxy). `src/renderer/src/lib/platform.js` detects Electron (`window.api`) vs Capacitor (`Capacitor.isNativePlatform()`). Electron resolves to the preload bridge; Capacitor resolves to `src/renderer/src/lib/capacitor/api.js` (SQLite + Filesystem). **All renderer code imports `api` from `@renderer/lib/api.js` — never `window.api` directly.**
- **Shared schema/logic:** `src/shared/schema.js` holds the DDL for both platforms; `src/shared/validate.js` and `src/shared/dates.js` hold pure validation/date helpers. `src/main/db/schema.js`, `validate.js`, and `repositories/helpers.js` re-export these so desktop and mobile cannot drift.
- `src/main/db/connection.js` does **not** import Electron (testable with plain Node). Main injects `app.getPath('userData')`.
- Repositories take `db` as the first argument; keep them Electron-free.
- IPC: register handlers via `handle(channel, fn, { auth })` in `src/main/ipc/handle.js`. Responses are `{ ok, data }` / `{ ok, error }`; preload unwraps and throws on error.
- Auth session lives in the main process (`src/main/db/session.js`), keyed by `webContents.id`. Never trust a `userId` from the renderer. On mobile the Capacitor adapter keeps an in-memory session (not persisted) so startup-restore semantics match desktop.

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
- **Capacitor packages live in `devDependencies`** (they are bundled into the Android web build and are irrelevant to the Electron package, keeping `dependencies` = `better-sqlite3` only). The Capacitor SQLite layer applies migrations with idempotent statements so re-running is safe; it mirrors `src/main/db/repositories/*` SQL, so **change both** when altering data behavior.
- **Mobile-specific limits:** backup export writes JSON to the app's private data dir (not the desktop ZIP format) and backup *import* from file is not wired up yet; `files.openReceipt` (system viewer) is unsupported on Android. Receipt upload on mobile uses a hidden `<input type="file">` + Filesystem write. Mobile exports/backups use `Directory.Data` (app-private, no permission) because `Directory.Documents` is permission-gated and unwritable on Android 10 without a legacy flag.
- **Android build requirements (verified on this machine):** Capacitor 8 compiles against **Java 21** and **compileSdk 36**. `android/app/capacitor.build.gradle` sets Java 21, and `android/settings.gradle` registers the **Foojay toolchain resolver** so Gradle auto-provisions a JDK 21 into `~/.gradle/jdks` when needed. `build-capacitor.sh` exports `ANDROID_HOME` (`%LOCALAPPDATA%\Android\Sdk`) and picks a JDK 21 (Gradle cache → `C:\Program Files\Java\jdk-21*` → Android Studio's `jbr`) for `JAVA_HOME`. Gradle installs missing SDK platform/build-tools automatically. **Do not run Gradle on Android Studio's JDK 25** — Groovy build-script compilation fails with "Unsupported class file major version 69"; use a JDK 21. Running Gradle with a daemon keeps a background process alive after the script exits (harmless).
- **Release APK is signed:** `android/app/build.gradle` has a `signingConfigs.release` (reads `keystore.properties` at the repo root if present, else `release.keystore` with alias/password `release`/`android`). `release.keystore` is **gitignored** — keep it safe, since Android needs the same key to update an installed app. `assembleDebug` is signed with the debug key.
- The Capacitor adapter is validated by `scripts/capacitor-smoke.mjs` (SQL logic, auth, debts math, budgets, savings, reports, account wipe) against a real SQLite engine; the native plugin bridge, Filesystem permissions and the file picker still require an emulator/device to verify.
- `android/` and `assets/` are committed; `android/`'s own `.gitignore` excludes build outputs and the copied web assets (`app/src/main/assets/public`).
