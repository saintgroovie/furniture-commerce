#!/usr/bin/env bash
# LaunchAgent entrypoint for com.woodright.medusa-backend.
#
# CRITICAL: KeepAlive must watch a long-running Medusa process.
# Do NOT wrap oneshot `woodright-backend.sh start` (start → exit 0) with bare KeepAlive=true —
# that caused a 250+ restart storm and catalog flaps.
#
# This script exec's into woodright-backend.sh start with WOODRIGHT_START_FOREGROUND=1,
# so the LaunchAgent PID becomes Medusa itself (same pattern as run-storefront.sh).
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${WOODRIGHT_BACKEND_MODE:-develop}"
PORT="${WOODRIGHT_BACKEND_PORT:-9000}"
PAUSE_FILE="${WOODRIGHT_BACKEND_PAUSE_FILE:-$DIR/backend-${PORT}.pause}"

if [[ -f "$PAUSE_FILE" ]]; then
  echo "paused ($PAUSE_FILE present) - remove pause file to allow start"
  exit 0
fi

export WOODRIGHT_START_FOREGROUND=1
export WOODRIGHT_REPO_ROOT="${WOODRIGHT_REPO_ROOT:-/Users/leonidmbp/Documents/projects/furniture-commerce}"
exec /bin/bash "$DIR/woodright-backend.sh" start "$MODE"
