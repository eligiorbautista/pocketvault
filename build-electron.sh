#!/usr/bin/env bash
#
# PocketVault packaging script.
# Builds the renderer/main/preload bundles and packages installers into
# OS-specific output folders:
#   installers/windows/  installers/macos/  installers/linux/
#
# Usage:
#   ./build-electron.sh            # build for the current host OS
#   ./build-electron.sh win        # build Windows (nsis) installer
#   ./build-electron.sh mac        # build macOS (dmg) installer
#   ./build-electron.sh linux      # build Linux (AppImage)
#   ./build-electron.sh all        # attempt all targets (see caveats)
#
# Note: cross-building macOS .dmg is only supported on macOS, and building
# Linux AppImage is most reliable on Linux. Use the matching host OS when
# possible, or a CI matrix.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

TARGET="${1:-host}"

if [[ "$TARGET" == "host" ]]; then
  case "$(uname -s)" in
    Darwin*) TARGET="mac" ;;
    Linux*)  TARGET="linux" ;;
    MINGW*|MSYS*|CYGWIN*) TARGET="win" ;;
    *)
      echo "Unsupported host OS: $(uname -s). Pass win, mac, linux, or all." >&2
      exit 1
      ;;
  esac
fi

mkdir -p installers/windows installers/macos installers/linux

echo "==> Installing dependencies (if needed) and rebuilding native modules"
npm install

echo "==> Building application bundles (electron-vite)"
npm run build

echo "==> Packaging for target: $TARGET"
case "$TARGET" in
  win)
    npx electron-builder --win --config electron-builder.yml \
      --config.directories.output=installers/windows
    ;;
  mac)
    npx electron-builder --mac --config electron-builder.yml \
      --config.directories.output=installers/macos
    ;;
  linux)
    npx electron-builder --linux --config electron-builder.yml \
      --config.directories.output=installers/linux
    ;;
  all)
    npx electron-builder -wml --config electron-builder.yml \
      --config.directories.output=installers
    ;;
  *)
    echo "Unknown target: $TARGET (expected win|mac|linux|all|host)" >&2
    exit 1
    ;;
esac

echo "==> Done. Installers are in: $ROOT_DIR/installers/"
