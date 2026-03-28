#!/bin/bash
# session-start.sh — SessionStart hook for Claude Code.
# Runs every time a session starts (both new and resumed).
# Ensures PostgreSQL is running, dependencies are installed, DB is migrated,
# and Playwright browsers are bridged.

# Only run in remote/cloud environments
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Start PostgreSQL if not running
if command -v pg_isready &>/dev/null && ! pg_isready -q 2>/dev/null; then
  pg_ctlcluster 16 main start 2>/dev/null || true
fi

# Install deps if node_modules is missing
if [ ! -d node_modules ]; then
  yarn install --frozen-lockfile 2>/dev/null || true
fi

# Run deferred migrations once (cloud-setup.sh cannot access Doppler during setup).
# Use a marker file to avoid re-running on session resumes (~45s overhead).
MIGRATION_MARKER="/tmp/.t3app-db-migrated"
if [ ! -f "$MIGRATION_MARKER" ]; then
  if command -v doppler &>/dev/null && doppler secrets --only-names >/dev/null 2>&1; then
    _migrate_ok=true
    doppler run -- yarn db:generate >/dev/null || { echo "WARNING: db:generate failed" >&2; _migrate_ok=false; }
    doppler run -- yarn auth:migrate >/dev/null || { echo "WARNING: auth:migrate failed" >&2; _migrate_ok=false; }
    doppler run -- yarn db:migrate >/dev/null || { echo "WARNING: db:migrate (migrate deploy) failed" >&2; _migrate_ok=false; }
    if $_migrate_ok; then touch "$MIGRATION_MARKER"; fi
  fi
fi

# Bridge Playwright browser versions if needed
# The cloud image ships pre-installed browsers, but the version may lag behind
# the project's @playwright/test dependency. Create symlinks so Playwright
# finds the binary without downloading anything.
PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}"
if [ -d "$PW_CACHE" ] && [ -d node_modules/playwright-core ]; then
  INSTALLED_CHROMIUM=$(ls -d "$PW_CACHE"/chromium-[0-9]* 2>/dev/null | head -1)
  INSTALLED_HEADLESS=$(ls -d "$PW_CACHE"/chromium_headless_shell-[0-9]* 2>/dev/null | head -1)

  if [ -n "$INSTALLED_CHROMIUM" ]; then
    INSTALLED_REV=$(basename "$INSTALLED_CHROMIUM" | sed 's/chromium-//')
    BROWSERS_JSON="$CLAUDE_PROJECT_DIR/node_modules/playwright-core/browsers.json"
    NEEDED_REV=$(node -e "
      const b = require('$BROWSERS_JSON');
      const c = b.browsers.find(x => x.name === 'chromium');
      console.log(c ? c.revision : '');
    " 2>/dev/null || true)

    if [ -n "$NEEDED_REV" ] && [ "$NEEDED_REV" != "$INSTALLED_REV" ]; then
      # Full chromium browser
      NEEDED_DIR="$PW_CACHE/chromium-$NEEDED_REV"
      if [ ! -d "$NEEDED_DIR" ]; then
        mkdir -p "$NEEDED_DIR/chrome-linux"
        for f in "$INSTALLED_CHROMIUM"/chrome-linux/*; do
          ln -sf "$f" "$NEEDED_DIR/chrome-linux/"
        done
      fi

      # Headless shell (directory layout changed between Playwright versions)
      if [ -n "$INSTALLED_HEADLESS" ]; then
        NEEDED_HS_DIR="$PW_CACHE/chromium_headless_shell-$NEEDED_REV"
        if [ ! -d "$NEEDED_HS_DIR" ]; then
          mkdir -p "$NEEDED_HS_DIR/chrome-headless-shell-linux64"
          for f in "$INSTALLED_HEADLESS"/chrome-linux/*; do
            ln -sf "$f" "$NEEDED_HS_DIR/chrome-headless-shell-linux64/"
          done
          # Binary name changed: headless_shell -> chrome-headless-shell
          if [ -f "$INSTALLED_HEADLESS/chrome-linux/headless_shell" ] && \
             [ ! -e "$NEEDED_HS_DIR/chrome-headless-shell-linux64/chrome-headless-shell" ]; then
            ln -sf "$INSTALLED_HEADLESS/chrome-linux/headless_shell" \
              "$NEEDED_HS_DIR/chrome-headless-shell-linux64/chrome-headless-shell"
          fi
        fi
      fi
    fi
  fi
fi

exit 0
