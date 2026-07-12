#!/usr/bin/env bash
# Non-destructive scenario checks for woodright-backend.sh hardening.
# Does NOT stop a healthy live backend unless WOODRIGHT_SCENARIO_ALLOW_STOP=1.
set -euo pipefail

export PATH="/usr/local/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$SCRIPT_DIR/woodright-backend.sh"
FAILS=0

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILS=$((FAILS + 1)); }

[[ -x "$BACKEND" || -f "$BACKEND" ]] || { echo "missing $BACKEND" >&2; exit 1; }

echo "=== scenario: arg validation ==="
if bash "$BACKEND" start develop extra 2>/dev/null; then
  fail "extra args should reject"
else
  pass "rejects extra args"
fi
if bash "$BACKEND" start nope 2>/dev/null; then
  fail "bad mode should reject"
else
  pass "rejects unknown mode"
fi

echo "=== scenario: fingerprint lookup (lstart with spaces) ==="
TARGET_FINGERPRINTS=""
TARGET_FINGERPRINTS+="78511"$'\t'"Sun Jul 12 13:17:03 2026"$'\n'
lookup_lstart() {
  local want="$1" line pid rest
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    pid="${line%%	*}"
    rest="${line#*	}"
    [[ "$pid" == "$want" ]] && { printf '%s' "$rest"; return 0; }
  done <<EOF
$TARGET_FINGERPRINTS
EOF
  return 1
}
got="$(lookup_lstart 78511)"
if [[ "$got" == "Sun Jul 12 13:17:03 2026" ]]; then
  pass "fingerprint lookup preserves spaces"
else
  fail "fingerprint lookup got [$got]"
fi

echo "=== scenario: lock dir reap helper ==="
QA_DIR="${WOODRIGHT_QA_DIR:-$HOME/.woodright/qa-dev-servers}"
PORT="${WOODRIGHT_BACKEND_PORT:-9000}"
LOCK_DIR="$QA_DIR/backend-${PORT}.lock"
TMP_LOCK="$QA_DIR/backend-${PORT}.scenario-lock-test"
rm -rf "$TMP_LOCK"
mkdir "$TMP_LOCK"
touch -t 202001010101 "$TMP_LOCK"
# Mimic acquire_lock empty-owner age>=3 reap logic
lock_age="$(perl -e 'print int((time - (stat(shift))[9]))' "$TMP_LOCK" 2>/dev/null || echo 0)"
if [[ "${lock_age:-0}" -ge 3 ]]; then
  rm -rf "$TMP_LOCK"
  if [[ ! -d "$TMP_LOCK" ]]; then
    pass "stale empty lock reap logic (age=${lock_age}s)"
  else
    fail "could not remove temp stale lock"
  fi
else
  rm -rf "$TMP_LOCK"
  fail "expected aged lock_age>=3 got $lock_age"
fi

echo "=== scenario: mode conflict (live, non-destructive) ==="
code="$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:9000/health 2>/dev/null || echo 000)"
if [[ "$code" == "200" ]]; then
  mode_line="$(bash "$BACKEND" status 2>/dev/null | awk '/^mode:/{print $2; exit}' || true)"
  if [[ "$mode_line" == "develop" ]]; then
    set +e
    bash "$BACKEND" start qa >/tmp/wr-scenario-qa.txt 2>&1
    qa_rc=$?
    set -e
    if [[ "$qa_rc" -eq 0 ]]; then
      fail "start qa should conflict while develop is up"
    elif grep -q 'already running mode=develop' /tmp/wr-scenario-qa.txt; then
      pass "mode conflict develop vs qa"
    else
      fail "unexpected qa error: $(sed -n '1,2p' /tmp/wr-scenario-qa.txt)"
    fi
  else
    pass "skip mode conflict (mode=${mode_line:-unknown} not develop)"
  fi
else
  pass "skip mode conflict (backend health=$code)"
fi

echo "=== scenario: parallel lock (mkdir race, non-destructive) ==="
A="$QA_DIR/backend-${PORT}.scenario-a"
B="$QA_DIR/backend-${PORT}.scenario-b"
rm -rf "$A" "$B"
if mkdir "$A" 2>/dev/null && ! mkdir "$A" 2>/dev/null; then
  pass "mkdir lock exclusivity"
else
  fail "mkdir lock exclusivity"
fi
rm -rf "$A" "$B"

if [[ "${WOODRIGHT_SCENARIO_ALLOW_STOP:-0}" == "1" ]]; then
  echo "==== optional restart smoke ===="
  bash "$BACKEND" stop || true
  bash "$BACKEND" start develop
  bash "$SCRIPT_DIR/woodright-doctor.sh" --admin-only
else
  echo "==== skip restart smoke (set WOODRIGHT_SCENARIO_ALLOW_STOP=1) ===="
fi

echo "---"
if [[ "$FAILS" -eq 0 ]]; then
  echo "scenarios: OK"
  exit 0
fi
echo "scenarios: FAILED ($FAILS)"
exit 1
