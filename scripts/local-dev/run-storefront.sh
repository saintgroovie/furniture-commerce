#!/usr/bin/env bash
# LaunchAgent entrypoint for com.woodright.storefront-qa.
# Long-running: exec Next so KeepAlive watches the real Node process.
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${WOODRIGHT_REPO_ROOT:-${FURNITURE_REPO_ROOT:-/Users/leonidmbp/Documents/projects/furniture-commerce}}"
STOREFRONT_DIR="$REPO_ROOT/apps/storefront"
PORT="${WOODRIGHT_STOREFRONT_PORT:-3002}"
PAUSE_FILE="${WOODRIGHT_STOREFRONT_PAUSE_FILE:-$DIR/storefront-${PORT}.pause}"

if [[ -f "$PAUSE_FILE" ]]; then
  echo "paused ($PAUSE_FILE present) - remove pause file to allow start"
  exit 0
fi

export FURNITURE_REPO_ROOT="$REPO_ROOT"
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next}"

if [[ -d "${STOREFRONT_DIR}/.next" ]]; then
  corrupt="$(find "${STOREFRONT_DIR}/.next" -maxdepth 2 -name '* 2' -print -quit 2>/dev/null || true)"
  if [[ -n "${corrupt}" ]]; then
    # LaunchAgent may lack permission to wipe .next - never fail the runner on cleanup.
    rm -rf "${STOREFRONT_DIR}/.next" 2>/dev/null || true
  fi
fi

cd "$STOREFRONT_DIR"
exec node node_modules/next/dist/bin/next dev --port "$PORT"
