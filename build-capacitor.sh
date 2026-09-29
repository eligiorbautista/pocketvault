#!/usr/bin/env bash
#
# PocketVault Android (Capacitor) build script.
#
# Builds the web frontend, regenerates app icons + splash screens, syncs the
# web assets and native plugins into the Android project, then compiles an APK
# with Gradle and copies it into installers/android/.
#
# Usage:
#   ./build-capacitor.sh                 # debug APK (default)
#   ./build-capacitor.sh release         # release APK
#   BUILD_TYPE=release ./build-capacitor.sh
#
# Requirements:
#   - Node.js + npm (dependencies installed: npm install)
#   - JDK 21 (Capacitor 8 targets Java 21; Android Studio's bundled JDK works)
#   - Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT, or android/local.properties)
#
# Notes:
#   - Run from Git Bash / WSL on Windows, or a normal shell on macOS/Linux.
#   - Release builds need a signing config in android/app/build.gradle; without
#     one the generated release APK is unsigned (use `debug` for local testing).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BUILD_TYPE="${1:-${BUILD_TYPE:-debug}}"
case "$BUILD_TYPE" in
  debug)   GRADLE_TASK="assembleDebug";   APK_DIR="debug" ;;
  release) GRADLE_TASK="assembleRelease"; APK_DIR="release" ;;
  *)
    echo "Unknown build type: $BUILD_TYPE (expected debug|release)" >&2
    exit 1
    ;;
esac

OUT_DIR="installers/android"
APK_SEARCH_DIR="android/app/build/outputs/apk/$APK_DIR"

# Capacitor 8 compiles against Java 21 (see android/app/capacitor.build.gradle).
if command -v java >/dev/null 2>&1; then
  JAVA_MAJOR="$(java -version 2>&1 | head -n 1 | sed -E 's/.*version "([0-9]+).*/\1/')"
  if [[ -n "$JAVA_MAJOR" ]] && [[ "$JAVA_MAJOR" -lt 21 ]]; then
    echo "Warning: Capacitor 8 targets Java 21 but 'java' is version $JAVA_MAJOR." >&2
    echo "         Set JAVA_HOME to a JDK 21 install or the Gradle build may fail." >&2
  fi
else
  echo "Warning: 'java' was not found on PATH; Gradle needs JDK 21." >&2
fi

echo "PocketVault Android build"
echo "Build type : $BUILD_TYPE"
echo "Gradle task: $GRADLE_TASK"
echo

echo "==> 1/6 Building the web frontend (vite)"
npm run build

echo "==> 2/6 Generating app icons and splash screens"
if [[ -f "assets/icon.png" || -f "assets/icon-foreground.png" ]]; then
  npx capacitor-assets generate --android
else
  echo "    assets/icon.png not found - skipping asset generation"
fi

echo "==> 3/6 Syncing web assets and plugins to Android (cap sync)"
npx cap sync android

echo "==> 4/6 Compiling the APK with Gradle ($GRADLE_TASK)"
(
  cd android
  if [[ -x "./gradlew" ]]; then
    ./gradlew "$GRADLE_TASK"
  else
    gradle "$GRADLE_TASK"
  fi
)

echo "==> 5/6 Preparing output directory ($OUT_DIR)"
mkdir -p "$OUT_DIR"

echo "==> 6/6 Copying the APK into $OUT_DIR"
shopt -s nullglob
APKS=("$APK_SEARCH_DIR"/*.apk)
shopt -u nullglob

if [[ ${#APKS[@]} -eq 0 ]]; then
  echo "No APK found in $APK_SEARCH_DIR" >&2
  exit 1
fi

for apk in "${APKS[@]}"; do
  cp -f "$apk" "$OUT_DIR/"
  echo "    copied: $(basename "$apk")"
done

echo
echo "Success. APK written to: $ROOT_DIR/$OUT_DIR"
ls -la "$OUT_DIR"
