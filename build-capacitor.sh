#!/usr/bin/env bash
#
# PocketVault Android (Capacitor) build script.
#
# Builds the web frontend, regenerates app icons + splash screens, syncs the
# web assets and native plugins into the Android project, then compiles a
# SIGNED APK with Gradle and copies it into installers/android/.
#
# Usage:
#   ./build-capacitor.sh                 # signed release APK (default)
#   ./build-capacitor.sh debug           # debug APK (signed with the debug key)
#   ./build-capacitor.sh bundle          # signed release AAB (for Google Play)
#   BUILD_TYPE=release ./build-capacitor.sh
#
# Requirements:
#   - Node.js + npm (dependencies installed: npm install)
#   - Android SDK at %LOCALAPPDATA%\Android\Sdk (or ANDROID_HOME), with
#     platform + build-tools for compileSdk 36 (Gradle installs them if missing)
#   - A JDK to run Gradle. Capacitor 8 compiles against Java 21; a Java 21
#     toolchain is auto-provisioned by Gradle (see android/settings.gradle), so
#     a JDK 17+ to launch Gradle is enough. Android Studio's bundled JDK works.
#
# Notes:
#   - Run from Git Bash / WSL on Windows, or a normal shell on macOS/Linux.
#   - The release keystore (release.keystore, repo root) is generated on first
#     run together with keystore.properties (both gitignored) using a strong
#     random password. Keep them safe: Android needs the same key to update an
#     installed app. Override by pre-creating keystore.properties.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BUILD_TYPE="${1:-${BUILD_TYPE:-release}}"
case "$BUILD_TYPE" in
  debug)   GRADLE_TASK="assembleDebug";   ARTIFACT="apk"; APK_DIR="debug" ;;
  release) GRADLE_TASK="assembleRelease"; ARTIFACT="apk"; APK_DIR="release" ;;
  bundle)  GRADLE_TASK="bundleRelease";   ARTIFACT="aab" ;;
  *)
    echo "Unknown build type: $BUILD_TYPE (expected debug|release|bundle)" >&2
    exit 1
    ;;
esac

OUT_DIR="installers/android"
KEYSTORE="release.keystore"
KEYSTORE_PROPS="keystore.properties"

if [ "$ARTIFACT" = "aab" ]; then
  SEARCH_DIR="android/app/build/outputs/bundle/release"
  OUT_NAME="$(node -p "require('./capacitor.config.json').appName" 2>/dev/null || true)"
  [ -n "$OUT_NAME" ] || OUT_NAME="PocketVault"
  OUT_NAME="${OUT_NAME// /}.aab"
elif [ "$BUILD_TYPE" = "debug" ]; then
  APP_NAME="$(node -p "require('./capacitor.config.json').appName" 2>/dev/null || true)"
  [ -n "$APP_NAME" ] || APP_NAME="PocketVault"
  SEARCH_DIR="android/app/build/outputs/apk/debug"
  OUT_NAME="${APP_NAME// /}-debug.apk"
else
  APP_NAME="$(node -p "require('./capacitor.config.json').appName" 2>/dev/null || true)"
  [ -n "$APP_NAME" ] || APP_NAME="PocketVault"
  SEARCH_DIR="android/app/build/outputs/apk/release"
  OUT_NAME="${APP_NAME// /}.apk"
fi

# ---------------------------------------------------------------------------
# Android build environment
# ---------------------------------------------------------------------------
# Android SDK
if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "${ANDROID_HOME:-}" ]; then
  for candidate in "$LOCALAPPDATA/Android/Sdk" "$USERPROFILE/AppData/Local/Android/Sdk"; do
    candidate="${candidate//\\//}"
    if [ -d "$candidate" ]; then ANDROID_HOME="$candidate"; break; fi
  done
fi
# Git Bash exposes Windows paths with backslashes; normalize so the checks and
# apksigner lookup below always see forward slashes.
ANDROID_HOME="${ANDROID_HOME//\\//}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"

# JDK used to launch Gradle. Capacitor 8 compiles against Java 21, so a JDK 21
# is preferred (a newer JDK also works but can upset Gradle's Groovy scripts).
# The Foojay resolver downloads a JDK 21 into ~/.gradle/jdks on first build, so
# we search there too.
WINDOWS_USER_HOME="${USERPROFILE:-$HOME}"
WINDOWS_USER_HOME="${WINDOWS_USER_HOME//\\//}"

jdk_major() {
  [ -f "$1/release" ] || { printf '0'; return; }
  sed -n 's/^JAVA_VERSION="\([0-9][0-9]*\).*/\1/p' "$1/release" | head -n 1
}

find_java_home() {
  local candidate major
  local localappdata="${LOCALAPPDATA:-$WINDOWS_USER_HOME/AppData/Local}"
  localappdata="${localappdata//\\//}"
  for candidate in \
    "${JAVA_HOME:-}" \
    "$localappdata/Android/jdk-21" \
    "$WINDOWS_USER_HOME"/.gradle/jdks/* \
    "C:/Program Files/Java"/jdk-21* \
    "C:/Program Files/Eclipse Adoptium"/jdk-21* \
    "C:/Program Files/Android/Android Studio/jbr"; do
    [ -n "$candidate" ] && [ -d "$candidate" ] || continue
    [ "$(jdk_major "$candidate")" = "21" ] && { printf '%s' "$candidate"; return; }
  done
  for candidate in \
    "${JAVA_HOME:-}" \
    "$localappdata/Android/jdk-21" \
    "$WINDOWS_USER_HOME"/.gradle/jdks/* \
    "C:/Program Files/Android/Android Studio/jbr" \
    "C:/Program Files/Java"/jdk-2[0-9]*; do
    [ -n "$candidate" ] && [ -d "$candidate" ] || continue
    major="$(jdk_major "$candidate")"
    [ -n "$major" ] && [ "$major" -ge 21 ] 2>/dev/null && { printf '%s' "$candidate"; return; }
  done
}

DETECTED_JAVA_HOME="$(find_java_home)"
if [ -n "$DETECTED_JAVA_HOME" ]; then
  JAVA_HOME="$DETECTED_JAVA_HOME"
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
else
  echo "Warning: no JDK 21+ detected; Gradle will use 'java' from PATH." >&2
fi

echo "PocketVault Android build"
echo "Build type : $BUILD_TYPE"
echo "Gradle task: $GRADLE_TASK"
echo "Android SDK: $ANDROID_HOME"
echo "JAVA_HOME  : ${JAVA_HOME:-(system java)}"
echo "Output     : $OUT_NAME"
echo

echo "==> 1/6 Building the web frontend (vite)"
npm run build

echo "==> 2/6 Generating the logo, app icons and splash screens"
node scripts/generate-icon.mjs
npx capacitor-assets generate --android

echo "==> 3/6 Syncing web assets and plugins to Android (cap sync)"
npx cap sync android

if [ "$BUILD_TYPE" != "debug" ] && [ ! -f "$KEYSTORE" ]; then
  echo "==> Generating release keystore ($KEYSTORE) with a strong random password"
  KEYTOOL="keytool"
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/keytool" ]; then
    KEYTOOL="$JAVA_HOME/bin/keytool"
  fi
  # 32 hex chars from /dev/urandom (fallback to openssl). Never a weak default.
  STORE_PASS="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n' 2>/dev/null || true)"
  [ -n "$STORE_PASS" ] || STORE_PASS="$(openssl rand -hex 16)"
  "$KEYTOOL" -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias release \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$STORE_PASS" -keypass "$STORE_PASS" \
    -dname "CN=PocketVault, OU=PocketVault, O=PocketVault, L=Manila, ST=Metro Manila, C=PH"
  cat > "$KEYSTORE_PROPS" <<EOF
storeFile=../../release.keystore
storePassword=$STORE_PASS
keyAlias=release
keyPassword=$STORE_PASS
EOF
  chmod 600 "$KEYSTORE_PROPS" 2>/dev/null || true
  echo "    wrote $KEYSTORE_PROPS (gitignored) — back up both files!"
fi

echo "==> 4/6 Compiling with Gradle ($GRADLE_TASK)"
(
  cd android
  if [ -x "./gradlew" ]; then
    ./gradlew "$GRADLE_TASK"
  else
    gradle "$GRADLE_TASK"
  fi
)

echo "==> 5/6 Preparing output directory ($OUT_DIR)"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/app-*.apk "$OUT_DIR"/app-*.aab # drop legacy Gradle-named artifacts

echo "==> 6/6 Copying the $ARTIFACT into $OUT_DIR"
shopt -s nullglob
ARTIFACTS=("$SEARCH_DIR"/*."$ARTIFACT")
shopt -u nullglob

if [ ${#ARTIFACTS[@]} -eq 0 ]; then
  echo "No $ARTIFACT found in $SEARCH_DIR" >&2
  exit 1
fi

for artifact in "${ARTIFACTS[@]}"; do
  cp -f "$artifact" "$OUT_DIR/$OUT_NAME"
  echo "    copied: $(basename "$artifact") -> $OUT_NAME"
done

# Confirm signatures. apksigner verifies APKs; for an AAB the equivalent check
# is on the contained APKs, so we verify the signed APK if one exists and
# otherwise skip (Play verifies the AAB upload signature itself).
ANDROID_HOME_BASH="${ANDROID_HOME//\\//}"
LATEST_BUILD_TOOLS="$(ls "$ANDROID_HOME_BASH/build-tools" 2>/dev/null | sort -V | tail -n 1 || true)"
APKSIGNER_JAR="$ANDROID_HOME_BASH/build-tools/$LATEST_BUILD_TOOLS/lib/apksigner.jar"
JAVA_BIN="java"
if [ -n "${JAVA_HOME:-}" ] && { [ -e "$JAVA_HOME/bin/java" ] || [ -e "$JAVA_HOME/bin/java.exe" ]; }; then
  JAVA_BIN="$JAVA_HOME/bin/java"
fi
if [ "$ARTIFACT" = "apk" ] && [ -n "$LATEST_BUILD_TOOLS" ] && [ -f "$APKSIGNER_JAR" ]; then
  for apk in "$OUT_DIR"/*.apk; do
    echo "    signature: $(basename "$apk")"
    "$JAVA_BIN" -jar "$APKSIGNER_JAR" verify --print-certs "$apk" 2>/dev/null \
      | sed -n 's/^Signer #1 certificate DN:/      signer:/p' || true
  done
elif [ "$ARTIFACT" = "aab" ]; then
  echo "    (AAB: Play verifies the upload signature; local apksigner check skipped)"
else
  echo "    (apksigner not found; skipping signature check)"
fi

echo
echo "Success. $ARTIFACT written to: $ROOT_DIR/$OUT_DIR/$OUT_NAME"
ls -la "$OUT_DIR"
