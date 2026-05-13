#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_ID="al.kaleid.raffi"
MANIFEST="${SCRIPT_DIR}/${APP_ID}.yml"
STAGE_DIR="${SCRIPT_DIR}/stage"
TMP_BUILD_ROOT="/tmp/raffi-flatpak-build"
BUILD_DIR="${TMP_BUILD_ROOT}/flatpak-build"

cd "${APP_DIR}"

bun run server:build
bun run build
bunx electron-builder --linux --dir

rm -rf "${STAGE_DIR}/linux-unpacked"
mkdir -p "${STAGE_DIR}/icons"
cp -a "${APP_DIR}/release/linux-unpacked" "${STAGE_DIR}/linux-unpacked"
cp -a "${APP_DIR}/build/icons/128x128.png" "${STAGE_DIR}/icons/128x128.png"
cp -a "${APP_DIR}/build/icons/512x512.png" "${STAGE_DIR}/icons/512x512.png"

rm -rf "${TMP_BUILD_ROOT}"
mkdir -p "${TMP_BUILD_ROOT}"
cp "${MANIFEST}" "${TMP_BUILD_ROOT}/${APP_ID}.yml"
cp "${SCRIPT_DIR}/run.sh" "${TMP_BUILD_ROOT}/run.sh"
cp "${SCRIPT_DIR}/${APP_ID}.desktop" "${TMP_BUILD_ROOT}/${APP_ID}.desktop"
cp "${SCRIPT_DIR}/${APP_ID}.metainfo.xml" "${TMP_BUILD_ROOT}/${APP_ID}.metainfo.xml"
cp -R "${STAGE_DIR}" "${TMP_BUILD_ROOT}/stage"

if ! command -v flatpak-builder >/dev/null 2>&1; then
  printf '%s\n' "flatpak-builder is not installed. Install flatpak-builder and the required Flatpak runtimes, then rerun this script." >&2
  exit 1
fi

flatpak-builder --force-clean --user --install "${BUILD_DIR}" "${TMP_BUILD_ROOT}/${APP_ID}.yml"

printf '%s\n' "Installed ${APP_ID}. Run it with: flatpak run ${APP_ID}"
