#!/bin/bash
# doppler-init.sh — configures Doppler inside the ralphex container.
# Appended to the official /srv/init.sh by Dockerfile.ralphex.
# Runs as root; the entrypoint drops to 'app' user for the main command.
#
# If DOPPLER_TOKEN is set, verifies connectivity and exports secrets
# to /srv/doppler-env.sh (sourced by app-init.sh or the app user).
# If no token is provided, skips gracefully — the container can still
# run with the Dockerfile ENV defaults.

set -eo pipefail

if [ -z "${DOPPLER_TOKEN:-}" ]; then
  echo "[doppler-init] DOPPLER_TOKEN not set — skipping Doppler setup (using ENV defaults)"
  exit 0
fi

echo "[doppler-init] DOPPLER_TOKEN detected, verifying access..."

# Verify token works by listing secret names
if doppler secrets --only-names --no-interactive --token="${DOPPLER_TOKEN}" >/dev/null 2>&1; then
  echo "[doppler-init] Doppler access verified"
else
  echo "[doppler-init] WARNING: Doppler token invalid or unreachable — falling back to ENV defaults"
  exit 0
fi

# Export Doppler secrets as environment variables for child processes.
# Write them to a file that can be sourced by the app user.
# Use restrictive umask so the file is never world-readable.
DOPPLER_DL_ERR=""
(umask 077; doppler secrets download --no-file --format=env --no-interactive --token="${DOPPLER_TOKEN}" \
  > /srv/doppler-env.sh 2>/tmp/doppler-dl-stderr) || DOPPLER_DL_ERR="true"

if [ -n "${DOPPLER_DL_ERR}" ]; then
  echo "[doppler-init] WARNING: Doppler secrets download failed — using ENV defaults"
  cat /tmp/doppler-dl-stderr 2>/dev/null || true
  rm -f /srv/doppler-env.sh /tmp/doppler-dl-stderr
elif [ -s /srv/doppler-env.sh ]; then
  rm -f /tmp/doppler-dl-stderr
  # Make it sourceable: prefix variable lines with 'export '
  # --format=env produces KEY="value" lines (quoted), safe for values with spaces
  sed -i '/^[A-Za-z_][A-Za-z0-9_]*=/s/^/export /' /srv/doppler-env.sh
  # Source into current shell so this script can verify the download.
  # Note: subsequent init scripts run as separate subprocesses and will NOT
  # inherit these exports. The main shell sources env-init.sh (which re-reads
  # /srv/doppler-env.sh) before exec'ing the app process.
  # shellcheck disable=SC1091
  . /srv/doppler-env.sh
  echo "[doppler-init] Doppler secrets exported ($(wc -l < /srv/doppler-env.sh) vars)"
else
  echo "[doppler-init] WARNING: no secrets downloaded — using ENV defaults"
  rm -f /srv/doppler-env.sh /tmp/doppler-dl-stderr
fi
