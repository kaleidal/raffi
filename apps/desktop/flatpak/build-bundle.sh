#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_ID="al.kaleid.raffi"
MANIFEST="${SCRIPT_DIR}/${APP_ID}.yml"
STAGE_DIR="${SCRIPT_DIR}/stage"
REPO_DIR="${SCRIPT_DIR}/repo"
BUILD_DIR="${SCRIPT_DIR}/builddir"
ARTIFACTS_DIR="${SCRIPT_DIR}/artifacts"
VERSION="${RAFFI_VERSION:-$(cd "${APP_DIR}" && bun -e "console.log(require('./package.json').version)")}"
BUNDLE_PATH="${ARTIFACTS_DIR}/Raffi-${VERSION}-x86_64.flatpak"

if [ ! -d "${APP_DIR}/release/linux-unpacked" ]; then
  printf '%s\n' "Missing release/linux-unpacked. Run electron-builder with --linux --dir before building the Flatpak bundle." >&2
  exit 1
fi

if ! command -v flatpak-builder >/dev/null 2>&1; then
  printf '%s\n' "flatpak-builder is not installed. Install flatpak-builder and the required Flatpak runtimes, then rerun this script." >&2
  exit 1
fi

rm -rf "${STAGE_DIR}/linux-unpacked" "${STAGE_DIR}/icons" "${REPO_DIR}" "${BUILD_DIR}" "${ARTIFACTS_DIR}"
mkdir -p "${STAGE_DIR}/icons" "${ARTIFACTS_DIR}"
cp -a "${APP_DIR}/release/linux-unpacked" "${STAGE_DIR}/linux-unpacked"
cp -a "${APP_DIR}/build/icons/128x128.png" "${STAGE_DIR}/icons/128x128.png"
cp -a "${APP_DIR}/build/icons/512x512.png" "${STAGE_DIR}/icons/512x512.png"

install_deps_args=()
if [ -n "${RAFFI_FLATPAK_INSTALL_DEPS_FROM:-}" ]; then
  install_deps_args+=(--install-deps-from="${RAFFI_FLATPAK_INSTALL_DEPS_FROM}")
fi

flatpak-builder --force-clean --user "${install_deps_args[@]}" --repo="${REPO_DIR}" "${BUILD_DIR}" "${MANIFEST}"

runtime_repo_args=()
if [ -n "${RAFFI_FLATPAK_RUNTIME_REPO:-}" ]; then
  runtime_repo_args+=(--runtime-repo="${RAFFI_FLATPAK_RUNTIME_REPO}")
fi

flatpak build-bundle "${runtime_repo_args[@]}" "${REPO_DIR}" "${BUNDLE_PATH}" "${APP_ID}" master

printf '%s\n' "${BUNDLE_PATH}"
