#!/usr/bin/env bash
# Source of truth for com.woodright.storefront-qa entrypoint (KeepAlive).
#
# Deploy to the LaunchAgent path after edits (macOS TCC blocks launchd from
# executing scripts under Documents/ directly):
#   cp apps/storefront/scripts/run-storefront-qa.sh \
#      ~/.woodright/qa-dev-servers/run-storefront.sh
#   chmod +x ~/.woodright/qa-dev-servers/run-storefront.sh
#   launchctl kickstart -k gui/$(id -u)/com.woodright.storefront-qa
#
# Modes (WOODRIGHT_STOREFRONT_MODE):
#   develop - next dev (HMR; cold route compile)
#   qa      - next start from .next-build (buyer-uptime)
#
# QA durability: watches ~/.woodright/.../storefront-<port>.build-id (NOT the
# Documents BUILD_ID — launchd often cannot read that path under TCC). After
# yarn build, sync-qa-build-marker.mjs updates the marker; this wrapper then
# exits non-zero so KeepAlive reloads new CSS hashes.
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="${WOODRIGHT_REPO_ROOT:-${FURNITURE_REPO_ROOT:-}}"
if [[ -z "$REPO_ROOT" ]]; then
  if [[ "$SCRIPT_DIR" == */apps/storefront/scripts ]]; then
    REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  else
    echo "error: set WOODRIGHT_REPO_ROOT (LaunchAgent EnvironmentVariables)" >&2
    exit 1
  fi
fi
if [[ ! -d "$REPO_ROOT/apps/storefront" ]]; then
  echo "error: REPO_ROOT=$REPO_ROOT has no apps/storefront" >&2
  exit 1
fi
STOREFRONT_DIR="$REPO_ROOT/apps/storefront"
PORT="${WOODRIGHT_STOREFRONT_PORT:-3002}"
QA_DIR="${WOODRIGHT_QA_DIR:-$HOME/.woodright/qa-dev-servers}"
PAUSE_FILE="${WOODRIGHT_STOREFRONT_PAUSE_FILE:-$QA_DIR/storefront-${PORT}.pause}"
MODE="${WOODRIGHT_STOREFRONT_MODE:-develop}"
BUILD_MARKER="$QA_DIR/storefront-${PORT}.build-id"

mkdir -p "$QA_DIR"

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

cd "$STOREFRONT_DIR"

if [[ "$MODE" == "qa" ]]; then
  export NEXT_DIST_DIR=.next-build
  echo "storefront mode=qa NEXT_DIST_DIR=$NEXT_DIST_DIR port=$PORT marker=$BUILD_MARKER"

  # Marker is written by sync-qa-build-marker.mjs after yarn build (user shell
  # can read Documents/; launchd must not touch .next-build/BUILD_ID — TCC).
  # Missing marker → still serve; first appearance becomes the baseline (no
  # restart); subsequent changes trigger KeepAlive reload.
  START_ID="$(tr -d '[:space:]' <"$BUILD_MARKER" 2>/dev/null || true)"
  if [[ -z "$START_ID" ]]; then
    echo "warn: missing $BUILD_MARKER - run yarn build to enable auto-reload"
  fi

  node node_modules/next/dist/bin/next start --port "$PORT" &
  NEXT_PID=$!

  cleanup() {
    kill "$NEXT_PID" 2>/dev/null || true
    wait "$NEXT_PID" 2>/dev/null || true
  }
  trap cleanup EXIT TERM INT

  while kill -0 "$NEXT_PID" 2>/dev/null; do
    sleep 2
    if [[ ! -f "$BUILD_MARKER" ]]; then
      continue
    fi
    CUR_ID="$(tr -d '[:space:]' <"$BUILD_MARKER" 2>/dev/null || true)"
    if [[ -z "$CUR_ID" ]]; then
      continue
    fi
    if [[ -z "$START_ID" ]]; then
      START_ID="$CUR_ID"
      echo "qa build marker baseline $START_ID"
      continue
    fi
    if [[ "$CUR_ID" != "$START_ID" ]]; then
      echo "qa build marker changed ($START_ID -> $CUR_ID) - exiting so KeepAlive reloads assets"
      cleanup
      trap - EXIT TERM INT
      sleep 0.2
      exit 1
    fi
  done

  set +e
  wait "$NEXT_PID"
  status=$?
  trap - EXIT TERM INT
  exit "$status"
fi

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
