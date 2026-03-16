#!/usr/bin/env bash
# ralphex-dk.sh — Docker wrapper for ralphex
# Runs ralphex in the base image (Node 24, yarn, make, git included).
# Uses Claude subscription credentials from ~/.claude (no API key needed).
#
# Usage: bash .claude/scripts/ralphex-dk.sh <plan-file> [additional ralphex args...]

set -euo pipefail

PLAN_FILE="${1:-}"
if [[ -z "$PLAN_FILE" ]]; then
  echo "Usage: $0 <plan-file> [ralphex-args...]" >&2
  exit 1
fi

shift || true
EXTRA_ARGS=("$@")

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLAUDE_DIR="${HOME}/.claude"
IMAGE="ghcr.io/umputun/ralphex:latest"

echo "Pulling latest ralphex image..."
docker pull "${IMAGE}"

echo "Running ralphex in Docker sandbox..."
echo "  Project: ${PROJECT_DIR}"
echo "  Plan:    ${PLAN_FILE}"

docker run --rm \
  -v "${PROJECT_DIR}:/workspace" \
  -v "${CLAUDE_DIR}:/root/.claude:ro" \
  -w /workspace \
  ${ANTHROPIC_API_KEY:+-e ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"} \
  "${IMAGE}" \
  ralphex "${PLAN_FILE}" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
