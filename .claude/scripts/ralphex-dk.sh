#!/usr/bin/env bash
# ralphex-dk.sh — Bootstrap wrapper for the official ralphex Docker script.
# If ralphex-dk is installed locally, delegates to it.
# Otherwise, downloads the official wrapper to ~/.local/bin/ and runs it.
#
# Usage: bash .claude/scripts/ralphex-dk.sh <plan-file> [additional ralphex args...]
# Docs:  https://ralphex.com/docs/#using-docker

set -euo pipefail

OFFICIAL_URL="https://raw.githubusercontent.com/umputun/ralphex/master/scripts/ralphex-dk.sh"
INSTALL_DIR="${HOME}/.local/bin"
INSTALL_PATH="${INSTALL_DIR}/ralphex-dk"

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <plan-file> [ralphex-args...]" >&2
  echo "Delegates to the official ralphex Docker wrapper (ralphex-dk)." >&2
  echo "See: https://ralphex.com/docs/#using-docker" >&2
  exit 1
fi

# Find or install the official wrapper
if command -v ralphex-dk &>/dev/null; then
  WRAPPER="$(command -v ralphex-dk)"
elif [[ -x "${INSTALL_PATH}" ]]; then
  WRAPPER="${INSTALL_PATH}"
else
  echo "ralphex-dk not found. Installing official wrapper to ${INSTALL_PATH}..."
  mkdir -p "${INSTALL_DIR}"
  curl -fsSL "${OFFICIAL_URL}" -o "${INSTALL_PATH}"
  chmod +x "${INSTALL_PATH}"
  echo "Installed ralphex-dk $(${INSTALL_PATH} --version 2>/dev/null || echo '(version unknown)')."
  WRAPPER="${INSTALL_PATH}"
fi

exec "${WRAPPER}" "$@"
