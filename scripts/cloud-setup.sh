#!/bin/bash
# cloud-setup.sh — Prepares a development environment for t3-extended-template.
#
# Works in both:
#   - Claude Code cloud web sessions (set as Setup Script in environment settings)
#   - Local machines (run manually: bash scripts/cloud-setup.sh)
#
# What it does:
#   1. Installs Doppler CLI if missing
#   2. Starts PostgreSQL and configures passwordless local TCP access
#   3. Creates the "app" database and "auth" schema
#   4. Installs bun dependencies
#   5. Runs auth migrations and pushes the DB schema (requires Doppler)
#   6. Bridges Playwright browser versions if the installed revision differs from what the project needs
#   7. Installs ralphex CLI for autonomous multi-task execution
#
# Prerequisites:
#   - Bun 1.x, PostgreSQL 16
#   - DOPPLER_TOKEN env var (set in cloud environment settings, or via `doppler login` locally)

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# 1. Doppler CLI
# ---------------------------------------------------------------------------
echo "==> [1/7] Doppler CLI..."
if ! command -v doppler &>/dev/null; then
  if [ "$(uname)" = "Linux" ]; then
    apt-get update -qq
    apt-get install -y -qq apt-transport-https ca-certificates curl gnupg >/dev/null 2>&1
    curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
      'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' \
      | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" \
      > /etc/apt/sources.list.d/doppler-cli.list
    apt-get update -qq
    apt-get install -y -qq doppler >/dev/null 2>&1
  elif [ "$(uname)" = "Darwin" ]; then
    brew install doppler 2>/dev/null || { echo "    Install Doppler: https://docs.doppler.com/docs/install-cli"; exit 1; }
  fi
  echo "    Installed $(doppler --version)"
else
  echo "    Already installed ($(doppler --version))"
fi

# Debug: check if Doppler token and config are available during setup
echo "    DOPPLER_TOKEN set: $([ -n "${DOPPLER_TOKEN:-}" ] && echo yes || echo no)"
echo "    DOPPLER_PROJECT: ${DOPPLER_PROJECT:-<unset>}"
echo "    DOPPLER_CONFIG: ${DOPPLER_CONFIG:-<unset>}"
echo "    Working dir: $(pwd)"
echo "    doppler.yaml exists: $([ -f doppler.yaml ] && echo yes || echo no)"

# Quick connectivity test — use doppler CLI to avoid exposing token in process args
if [ -n "${DOPPLER_TOKEN:-}" ] && command -v doppler &>/dev/null; then
  if doppler secrets --only-names --no-interactive 2>/dev/null | head -1 >/dev/null; then
    echo "    Doppler API reachable: yes"
  else
    echo "    Doppler API reachable: no (doppler CLI returned exit code $?)"
  fi
elif [ -n "${DOPPLER_TOKEN:-}" ]; then
  # Fallback: test connectivity without exposing token in process args
  if curl -sf --max-time 5 "https://api.doppler.com/v3/me" -H @- >/dev/null 2>&1 <<< "Authorization: Bearer ${DOPPLER_TOKEN}"; then
    echo "    Doppler API reachable: yes"
  else
    echo "    Doppler API reachable: no (exit code $?)"
  fi
else
  echo "    Doppler API reachable: skipped (no DOPPLER_TOKEN)"
fi

# ---------------------------------------------------------------------------
# 2. PostgreSQL
# ---------------------------------------------------------------------------
echo "==> [2/7] PostgreSQL..."
if command -v pg_isready &>/dev/null; then
  if ! pg_isready -q 2>/dev/null; then
    # Try starting PostgreSQL (works on Ubuntu/Debian cloud images)
    if command -v pg_ctlcluster &>/dev/null; then
      pg_ctlcluster 16 main start 2>/dev/null || pg_ctlcluster 15 main start 2>/dev/null || true
    elif command -v pg_ctl &>/dev/null; then
      pg_ctl start -D /var/lib/postgresql/data 2>/dev/null || true
    fi
  fi

  # Allow passwordless local TCP connections so DATABASE_URL without password works
  PG_HBA=$(find /etc/postgresql -name pg_hba.conf 2>/dev/null | head -1)
  if [ -n "$PG_HBA" ] && ! grep -q "# dev-setup" "$PG_HBA" 2>/dev/null; then
    sed -i '/^host.*all.*all.*127\.0\.0\.1/c\host    all    all    127.0.0.1/32    trust    # dev-setup' "$PG_HBA"
    sed -i '/^host.*all.*all.*::1/c\host    all    all    ::1/128    trust    # dev-setup' "$PG_HBA"
    # Reload to pick up pg_hba changes
    if command -v pg_ctlcluster &>/dev/null; then
      PG_VER=$(ls /etc/postgresql/ | sort -rn | head -1)
      pg_ctlcluster "$PG_VER" main reload 2>/dev/null || true
    else
      pg_ctl reload 2>/dev/null || true
    fi
  fi
  echo "    PostgreSQL running with trust auth for local TCP"
else
  echo "    PostgreSQL not found — install it or use Docker"
fi

# ---------------------------------------------------------------------------
# 3. Database & schema
# ---------------------------------------------------------------------------
echo "==> [3/7] Database and auth schema..."
# Use sudo -u postgres for socket auth (works even when TCP trust isn't yet active)
if command -v psql &>/dev/null; then
  sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='app'" 2>/dev/null | grep -q 1 \
    || sudo -u postgres psql -c "CREATE DATABASE app;" 2>/dev/null
  sudo -u postgres psql -d app -c "CREATE SCHEMA IF NOT EXISTS auth;" 2>/dev/null
  echo "    Database 'app' and schema 'auth' ready"
else
  echo "    psql not found — skipping DB creation"
fi

# ---------------------------------------------------------------------------
# 4. Dependencies
# ---------------------------------------------------------------------------
echo "==> [4/7] Installing dependencies..."
bun install --frozen-lockfile 2>&1 | tail -1
echo "    Done"

# ---------------------------------------------------------------------------
# 5. Migrations & schema
# ---------------------------------------------------------------------------
echo "==> [5/7] Migrations and schema push..."
# Doppler is needed for DATABASE_URL. In cloud environments the network proxy
# blocks api.doppler.com during setup scripts, so migrations are deferred to
# the SessionStart hook where Doppler works at runtime.
echo "    Deferred to SessionStart hook (requires Doppler at runtime)"

# ---------------------------------------------------------------------------
# 6. Playwright browsers
# ---------------------------------------------------------------------------
echo "==> [6/7] Playwright browsers..."
# The cloud image ships pre-installed Playwright browsers, but the version may
# lag behind the project's @playwright/test dependency. When that happens, we
# create symlinks from the installed revision to the expected one so Playwright
# finds the binary without downloading anything (no network needed).
PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-${HOME}/.cache/ms-playwright}"
if [ -d "$PW_CACHE" ]; then
  INSTALLED_CHROMIUM=$(ls -d "$PW_CACHE"/chromium-[0-9]* 2>/dev/null | head -1)
  INSTALLED_HEADLESS=$(ls -d "$PW_CACHE"/chromium_headless_shell-[0-9]* 2>/dev/null | head -1)

  if [ -n "$INSTALLED_CHROMIUM" ]; then
    INSTALLED_REV=$(basename "$INSTALLED_CHROMIUM" | sed 's/chromium-//')
    BROWSERS_JSON="$PROJECT_DIR/node_modules/playwright-core/browsers.json"
    NEEDED_REV=$(bun -e "
      const b = require('$BROWSERS_JSON');
      const c = b.browsers.find(x => x.name === 'chromium');
      console.log(c ? c.revision : '');
    " 2>/dev/null || true)

    if [ -n "$NEEDED_REV" ] && [ "$NEEDED_REV" != "$INSTALLED_REV" ]; then
      echo "    Bridging chromium $INSTALLED_REV -> $NEEDED_REV"

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
    else
      echo "    Browsers up to date (rev $INSTALLED_REV)"
    fi
  fi
else
  # No pre-installed browsers — try to download (needs network)
  bunx playwright install chromium 2>/dev/null && echo "    Chromium installed" \
    || echo "    No browsers found. Run: bunx playwright install chromium"
fi

# ---------------------------------------------------------------------------
# 7. Ralphex CLI (autonomous multi-task execution)
# ---------------------------------------------------------------------------
echo "==> [7/7] Ralphex CLI..."
if command -v ralphex &>/dev/null; then
  echo "    Already installed ($(ralphex --version 2>/dev/null || echo 'unknown version'))"
else
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "$INSTALL_DIR"

  if [ "$(uname)" = "Linux" ]; then
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64)  RALPHEX_ARCH="amd64" ;;
      aarch64) RALPHEX_ARCH="arm64" ;;
      *)       echo "    Unsupported architecture: $ARCH"; RALPHEX_ARCH="" ;;
    esac

    if [ -n "${RALPHEX_ARCH:-}" ]; then
      # Fetch latest release tag from GitHub API
      LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/umputun/ralphex/releases/latest" 2>/dev/null \
        | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//' || true)

      if [ -n "$LATEST_TAG" ]; then
        DOWNLOAD_URL="https://github.com/umputun/ralphex/releases/download/${LATEST_TAG}/ralphex_${LATEST_TAG#v}_linux_${RALPHEX_ARCH}.tar.gz"
        echo "    Downloading ralphex ${LATEST_TAG} for linux/${RALPHEX_ARCH}..."
        if curl -fsSL "$DOWNLOAD_URL" | tar xz -C "$INSTALL_DIR" ralphex 2>/dev/null; then
          chmod +x "$INSTALL_DIR/ralphex"
          echo "    Installed to $INSTALL_DIR/ralphex"
        else
          echo "    WARNING: Failed to download ralphex. Install manually: https://ralphex.com/docs/"
        fi
      else
        echo "    WARNING: Could not determine latest ralphex version. Install manually."
      fi
    fi
  elif [ "$(uname)" = "Darwin" ]; then
    brew install umputun/apps/ralphex 2>/dev/null \
      && echo "    Installed via Homebrew" \
      || echo "    WARNING: Failed to install ralphex. Run: brew install umputun/apps/ralphex"
  fi

  # Ensure ~/.local/bin is in PATH for this session
  if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    export PATH="$INSTALL_DIR:$PATH"
  fi

  # Verify installation
  if command -v ralphex &>/dev/null; then
    echo "    ralphex $(ralphex --version 2>/dev/null || echo '') ready"
  fi
fi

echo ""
echo "=== Environment ready ==="
echo "    bun run up        # start dev server"
echo "    bun run test:e2e  # run E2E tests"
echo "    bun run test:unit # run unit tests"
echo "    bun run lint      # run linter"
echo "    bun run typecheck # run type checker"
echo "    bin/ralphex       # autonomous multi-task execution"
