# PocketVault — Agent Notes

Offline-first Electron + React + SQLite finance tracker. See `README.md` for user-facing docs.

## Commands

- Install: `npm install` (runs `postinstall`: `electron-builder install-app-deps` + ensures the Electron binary).
- Dev: `npm run dev` (Electron + hot reload). Port 5173 may be taken by Docker on this machine → it falls back to the next free port.
- Build bundles: `npm run build` → `out/`.
- Preview build: `npm run start`.
- Package: `npm run build:win` / `build:mac` / `build:linux` (or `./build-electron.sh [win|mac|linux|all]`).
- Icons: `npm run icons` (regenerates `build/icon.png` + `build/icon.ico`, no deps).
- DB/repository smoke test (run from repo root):
  `npx esbuild scripts/db-smoke.mjs --bundle --platform=node --format=cjs --external:better-sqlite3 --outfile=".pv-smoke.cjs"; node .pv-smoke.cjs`
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
- Renderer bundle is large (~2.5 MB) because jsPDF/html2canvas and Recharts are eager; code-split `src/renderer/src/lib/export.js` if needed.
- `@electron/rebuild` is a devDependency for an explicit `npm run rebuild`; electron-builder already rebuilds native deps, so its warning is informational.
