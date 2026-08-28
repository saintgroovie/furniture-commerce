#!/usr/bin/env bash
# Source of truth in git. After edits, deploy to the LaunchAgent path:
#   cp scripts/local-dev/run-backend.sh ~/.woodright/qa-dev-servers/run-backend.sh
#   chmod +x ~/.woodright/qa-dev-servers/run-backend.sh
# Do not kickstart a healthy :9000 just to pick up the wait; next restart uses it.
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
CANONICAL_ROOT="/Users/leonidmbp/Documents/projects/furniture-commerce"
QA_DIR="${WOODRIGHT_QA_DIR:-$HOME/.woodright/qa-dev-servers}"
if [[ -f "$QA_DIR/runtime-root.env" ]]; then
  # shellcheck disable=SC1091
  source "$QA_DIR/runtime-root.env"
fi
PORT="${WOODRIGHT_BACKEND_PORT:-9000}"
pick_root() {
  local want="$1"
  local rp
  if ! rp="$(python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$want")"; then
    echo "error: cannot realpath $want (python failed); fail closed" >&2
    return 1
  fi
  if [[ "$rp" == *"iCloud Drive"* ]]; then
    if [[ -z "${WOODRIGHT_RUNTIME_ROOT:-}" || ! -d "${WOODRIGHT_RUNTIME_ROOT}/apps/backend" ]]; then
      echo "error: $want is iCloud-archived ($rp); set WOODRIGHT_RUNTIME_ROOT in $QA_DIR/runtime-root.env" >&2
      return 1
    fi
    local rr
    if ! rr="$(python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$WOODRIGHT_RUNTIME_ROOT")"; then
      echo "error: cannot realpath WOODRIGHT_RUNTIME_ROOT=$WOODRIGHT_RUNTIME_ROOT; fail closed" >&2
      return 1
    fi
    if [[ "$rr" == *"iCloud Drive"* ]]; then
      echo "error: WOODRIGHT_RUNTIME_ROOT is iCloud-archived ($rr); use an on-disk clone" >&2
      return 1
    fi
    echo "warn: DEGRADED :9000 runtime $rr" >&2
    printf '%s' "$rr"
  else
    printf '%s' "$want"
  fi
}
if [[ "$PORT" == "9000" && "${WOODRIGHT_ALLOW_NONCANONICAL_PRIMARY:-}" != "1" ]]; then
  selected_root="$(pick_root "$CANONICAL_ROOT")" || exit 1
else
  selected_root="$(pick_root "${WOODRIGHT_REPO_ROOT:-$CANONICAL_ROOT}")" || exit 1
fi
export WOODRIGHT_REPO_ROOT="$selected_root"

# After reboot Docker Desktop may still be coming up. Waiting here prevents a
# KeepAlive storm of Medusa ECONNREFUSED. Timeout exits 0 so launchd does not
# immediately relaunch (SuccessfulExit=false). Kickstart after postgres is up.
port_open() {
  python3 -c "import socket,sys; p=int(sys.argv[1]); s=socket.socket(); s.settimeout(1); r=s.connect_ex(('127.0.0.1',p)); s.close(); raise SystemExit(0 if r==0 else 1)" "$1"
}
wait_hybrid_infra() {
  local i
  echo "waiting for postgres :5432 and redis :6379 (max 90s)"
  for i in $(seq 1 45); do
    if port_open 5432 && port_open 6379; then
      echo "hybrid infra ready (:5432 :6379)"
      return 0
    fi
    sleep 2
  done
  echo "error: postgres/redis not ready after 90s; not exec Medusa (avoid KeepAlive storm). Start Docker postgres+redis, then kickstart com.woodright.medusa-backend." >&2
  exit 0
}
wait_hybrid_infra

exec /bin/bash "$DIR/woodright-backend.sh" start "$MODE"
