#!/usr/bin/env bash
#
# PocketVault desktop packaging script (Windows only).
#
# Builds the Electron app bundles and packages the Windows installers
# (NSIS .exe + MSI) into installers/windows/.
#
# Usage:
#   ./build-electron.sh            # package the Windows installers
#
# Notes:
#   - Run from Git Bash / WSL on Windows, or a normal shell on Windows.
#   - The Android build lives in build-capacitor.sh (signed APK/AAB).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

OUT="installers/windows"

echo "Host kernel     : $(uname -s 2>/dev/null || echo unknown)"
echo "Packaging target: win"
echo "Output folder   : $ROOT_DIR/$OUT"

mkdir -p "$OUT"

echo "==> Installing dependencies (native deps rebuilt for Electron)"
npm install

echo "==> Building application bundles (electron-vite)"
npm run build

echo "==> Packaging with electron-builder (--win)"
npx electron-builder --win --publish never --config electron-builder.yml \
  --config.directories.output="$OUT"

echo "==> Done. Installers written to: $ROOT_DIR/$OUT"
ls -la "$OUT" 2>/dev/null || true
