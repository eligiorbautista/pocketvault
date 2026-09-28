#!/usr/bin/env bash
#
# PocketVault packaging script.
#
# Automatically detects the operating system you are running on and builds the
# matching installer into the OS-specific output folder:
#
#   Windows  -> installers/windows/   (NSIS .exe + MSI)
#   macOS    -> installers/macos/     (.dmg)
#   Linux    -> installers/linux/     (.AppImage)
#
# Usage:
#   ./build-electron.sh            # auto-detect the host OS and package it
#   ./build-electron.sh detect     # only print the detected OS + output folder
#   ./build-electron.sh win|mac|linux   # force a specific target
#   ./build-electron.sh all        # attempt all targets into installers/
#
# Notes:
#   - Run from Git Bash / WSL on Windows, or a normal shell on macOS/Linux.
#   - Cross-building a macOS .dmg only works on macOS; Linux AppImage is most
#     reliable on Linux. Use the matching host OS (or the CI workflow).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

detect_os() {
  local uname_s
  uname_s="$(uname -s 2>/dev/null || echo unknown)"
  case "$uname_s" in
    Darwin) echo "mac" ;;
    Linux)
      # Native Linux or WSL; both package the Linux target.
      echo "linux"
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT*) echo "win" ;;
    *)
      case "${OSTYPE:-}:${MSYSTEM:-}" in
        msys*|cygwin*|win32*|mingw*) echo "win" ;;
        darwin*) echo "mac" ;;
        linux-gnu*|linux*) echo "linux" ;;
        *) echo "unknown" ;;
      esac
      ;;
  esac
}

TARGET="${1:-auto}"
if [[ "$TARGET" == "auto" || "$TARGET" == "host" ]]; then
  TARGET="$(detect_os)"
fi

if [[ "$TARGET" == "detect" ]]; then
  DETECTED="$(detect_os)"
  case "$DETECTED" in
    win) FOLDER="installers/windows" ;;
    mac) FOLDER="installers/macos" ;;
    linux) FOLDER="installers/linux" ;;
    *) FOLDER="(unknown)" ;;
  esac
  echo "Host OS kernel : $(uname -s 2>/dev/null || echo unknown)"
  echo "Detected target: $DETECTED"
  echo "Output folder  : $ROOT_DIR/$FOLDER"
  exit 0
fi

case "$TARGET" in
  win)   OUT="installers/windows"; FLAG="--win" ;;
  mac)   OUT="installers/macos";   FLAG="--mac" ;;
  linux) OUT="installers/linux";   FLAG="--linux" ;;
  all)   OUT="installers";         FLAG="-wml" ;;
  *)
    echo "Unknown target: $TARGET (expected auto|detect|win|mac|linux|all)" >&2
    exit 1
    ;;
esac

echo "Host kernel     : $(uname -s 2>/dev/null || echo unknown)"
echo "Packaging target: $TARGET"
echo "Output folder   : $ROOT_DIR/$OUT"

mkdir -p "$OUT"

echo "==> Installing dependencies (native deps rebuilt for Electron)"
npm install

echo "==> Building application bundles (electron-vite)"
npm run build

echo "==> Packaging with electron-builder ($FLAG)"
# shellcheck disable=SC2086
npx electron-builder $FLAG --config electron-builder.yml \
  --config.directories.output="$OUT"

echo "==> Done. Installers written to: $ROOT_DIR/$OUT"
ls -la "$OUT" 2>/dev/null || true
