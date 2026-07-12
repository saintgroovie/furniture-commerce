#!/usr/bin/env bash
# LaunchAgent entrypoint for com.woodright.storefront-qa.
# Long-running: exec Next so KeepAlive watches the real Node process.
#
# Modes (WOODRIGHT_STOREFRONT_MODE):
#   develop - next dev (default for interactive edits; cold route compile)
#   qa      - next start from .next-build (buyer-uptime; no mid-compile pauses)
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${WOODRIGHT_REPO_ROOT:-${FURNITURE_REPO_ROOT:-/Users/leonidmbp/Documents/projects/furniture-commerce}}"
STOREFRONT_DIR="$REPO_ROOT/apps/storefront"
PORT="${WOODRIGHT_STOREFRONT_PORT:-3002}"
PAUSE_FILE="${WOODRIGHT_STOREFRONT_PAUSE_FILE:-$DIR/storefront-${PORT}.pause}"
MODE="${WOODRIGHT_STOREFRONT_MODE:-develop}"

if [[ -f "$PAUSE_FILE" ]]; then
  echo "paused ($PAUSE_FILE present) - remove pause file to allow start"
  exit 0
fi

export FURNITURE_REPO_ROOT="$REPO_ROOT"

normalize_mode() {
  case "${1:-}" in
    qa|QA) printf 'qa' ;;
    develop|dev|development|"") printf 'develop' ;;
    *)
      echo "warn: unknown WOODRIGHT_STOREFRONT_MODE=$1 - using develop" >&2
      printf 'develop'
      ;;
  esac
}

MODE="$(normalize_mode "$MODE")"
BUILD_ID="$STOREFRONT_DIR/.next-build/BUILD_ID"

if [[ "$MODE" == "qa" && ! -f "$BUILD_ID" ]]; then
  echo "warn: qa build missing (need apps/storefront yarn build → .next-build/BUILD_ID) - falling back to develop" >&2
  MODE=develop
fi

cd "$STOREFRONT_DIR"

if [[ "$MODE" == "qa" ]]; then
  export NEXT_DIST_DIR=.next-build
  echo "storefront mode=qa NEXT_DIST_DIR=$NEXT_DIST_DIR port=$PORT"
  exec node node_modules/next/dist/bin/next start --port "$PORT"
fi

# develop: align with package.json "dev" distDir; scrub Finder-duplicate .next folders
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-dev}"
if [[ -d "${STOREFRONT_DIR}/.next" ]]; then
  corrupt="$(find "${STOREFRONT_DIR}/.next" -maxdepth 2 -name '* 2' -print -quit 2>/dev/null || true)"
  if [[ -n "${corrupt}" ]]; then
    rm -rf "${STOREFRONT_DIR}/.next" 2>/dev/null || true
  fi
fi
if [[ -d "${STOREFRONT_DIR}/.next-dev" ]]; then
  corrupt="$(find "${STOREFRONT_DIR}/.next-dev" -maxdepth 2 -name '* 2' -print -quit 2>/dev/null || true)"
  if [[ -n "${corrupt}" ]]; then
    rm -rf "${STOREFRONT_DIR}/.next-dev" 2>/dev/null || true
  fi
fi
echo "storefront mode=develop NEXT_DIST_DIR=$NEXT_DIST_DIR port=$PORT"
exec node node_modules/next/dist/bin/next dev --port "$PORT"
