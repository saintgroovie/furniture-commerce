#!/usr/bin/env bash
# Regression gate after production build:
# - public VM :9000 must not appear in client chunks
# - Docker-internal backend URL must not appear in client chunks
# - server manifests (routes-manifest) MAY contain http://backend:9000 (rewrite dest)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${NEXT_DIST_DIR:-.next-build}"
TARGET="${ROOT}/${DIST}"
CHUNKS="${TARGET}/static/chunks"

if [[ ! -d "$TARGET" ]]; then
  echo "gate: missing build dir $TARGET — run yarn build first" >&2
  exit 1
fi

fail=0

scan_chunks() {
  local pattern="$1"
  local label="$2"
  if [[ ! -d "$CHUNKS" ]]; then
    echo "warn: no $CHUNKS — skip client chunk scan for $label"
    return
  fi
  if command -v rg >/dev/null 2>&1; then
    if rg -l -F "$pattern" "$CHUNKS" 2>/dev/null | head -n 1 | grep -q .; then
      echo "FAIL: $label in client chunks ($pattern)" >&2
      rg -n -F "$pattern" "$CHUNKS" 2>/dev/null | head -n 15 >&2 || true
      fail=1
    else
      echo "ok: no $label in client chunks"
    fi
  else
    if grep -R -l -F "$pattern" "$CHUNKS" 2>/dev/null | head -n 1 | grep -q .; then
      echo "FAIL: $label in client chunks ($pattern)" >&2
      fail=1
    else
      echo "ok: no $label in client chunks"
    fi
  fi
}

scan_chunks "89.169.188.29:9000" "public backend IP:9000"
scan_chunks "http://backend:9000" "Docker-internal backend URL"
scan_chunks "http://medusa:9000" "Docker medusa hostname URL"
scan_chunks "89.169.188.29" "raw staging VM IP"
scan_chunks "localhost:9000" "localhost:9000"
scan_chunks "127.0.0.1:9000" "loopback:9000"

# Expect rewrite destinations in server routes-manifest
if command -v rg >/dev/null 2>&1; then
  if rg -q -F 'http://backend:9000/static' "$TARGET/routes-manifest.json" 2>/dev/null; then
    echo "ok: routes-manifest has internal /product-static rewrite"
  else
    echo "FAIL: routes-manifest missing internal product-static rewrite" >&2
    fail=1
  fi
  if rg -q -F '89.169.188.29:9000' "$TARGET/routes-manifest.json" 2>/dev/null; then
    echo "FAIL: routes-manifest still points at public :9000" >&2
    fail=1
  else
    echo "ok: routes-manifest has no public :9000"
  fi
fi

exit "$fail"
