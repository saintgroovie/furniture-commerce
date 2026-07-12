#!/usr/bin/env bash
# Durable Woodright Admin UX on :9001 (isolated DB medusa-admin-ux-b5).
# Survives Cursor agent shell abort — process is reparented to launchd (PPID=1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$ROOT/apps/backend/scripts/woodright-admin-ux-b5-daemon.py" "${1:-start}"
