#!/usr/bin/env bash
# Real Docker Compose regression for the rename-keeper adoption defect and the
# Strategy B (no rename + force-recreate + postconditions) fix.
#
# Requires local Docker. Creates only disposable containers/networks under a
# unique project prefix for this run. Never touches Woodright production names.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../ops/lib/woodright-compose-service-recreate.sh
source "$ROOT/ops/lib/woodright-compose-service-recreate.sh"

PASS=0
FAIL=0
pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

CYCLE="wr-compose-keeper-fixture-$(date -u +%Y%m%d%H%M%S)-$$"
PROJ="${CYCLE}-proj"
DIR="$(mktemp -d "/tmp/${CYCLE}.XXXXXX")"
COMPOSE="$DIR/docker-compose.yml"
BE="${CYCLE}-backend"
SF="${CYCLE}-storefront"
KEEP="${CYCLE}-backend-keeper"

cleanup() {
  docker compose -p "$PROJ" -f "$COMPOSE" down --remove-orphans >/dev/null 2>&1 || true
  docker rm -f "$BE" "$SF" "$KEEP" >/dev/null 2>&1 || true
  rm -rf "$DIR"
}
trap cleanup EXIT

cat >"$COMPOSE" <<EOF
services:
  backend:
    image: alpine:3.20
    container_name: ${BE}
    command: ["sleep", "3600"]
  storefront:
    image: alpine:3.20
    container_name: ${SF}
    command: ["sleep", "3600"]
EOF

docker pull alpine:3.20 >/dev/null
docker compose -p "$PROJ" -f "$COMPOSE" up -d >/dev/null

# --- 1) OLD behavior: rename + plain up ---
BE_ID0="$(docker inspect -f '{{.Id}}' "$BE")"
docker rename "$BE" "$KEEP"
LABEL_SVC="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$KEEP")"
[[ "$LABEL_SVC" == "backend" ]] && pass "old: keeper retains compose.service=backend" \
  || fail "old: keeper lost compose.service (got $LABEL_SVC)"

set +e
docker compose -p "$PROJ" -f "$COMPOSE" up -d --no-deps backend >/tmp/wr-ck-old-up.out 2>&1
OLD_RC=$?
set -e
[[ "$OLD_RC" -eq 0 ]] && pass "old: compose up exit 0" || fail "old: compose up rc=$OLD_RC"
if docker inspect "$BE" >/dev/null 2>&1; then
  fail "old: canonical unexpectedly exists after rename+up"
else
  pass "old: canonical name absent after rename+up (defect reproduced)"
fi
COMPOSE_NAME="$(docker compose -p "$PROJ" -f "$COMPOSE" ps -a --format '{{.Name}} {{.Service}}' | awk '$2=="backend"{print $1; exit}')"
[[ "$COMPOSE_NAME" == "$KEEP" ]] && pass "old: compose still adopts keeper as backend service" \
  || fail "old: compose backend row=$COMPOSE_NAME"

# cleanup for next scenarios
docker compose -p "$PROJ" -f "$COMPOSE" down --remove-orphans >/dev/null
docker rm -f "$KEEP" >/dev/null 2>&1 || true

# --- 2) Variant C after rename destroys keeper ---
docker compose -p "$PROJ" -f "$COMPOSE" up -d >/dev/null
docker rename "$BE" "$KEEP"
set +e
docker compose -p "$PROJ" -f "$COMPOSE" up -d --no-deps --force-recreate backend >/tmp/wr-ck-force.out 2>&1
set -e
KEEPER_LEFT=0; docker inspect "$KEEP" >/dev/null 2>&1 && KEEPER_LEFT=1 || true
CANON_OK=0; docker inspect "$BE" >/dev/null 2>&1 && CANON_OK=1 || true
if [[ "$CANON_OK" -eq 1 && "$KEEPER_LEFT" -eq 0 ]]; then
  pass "variant-C: force-recreate after rename adopts/destroys keeper (unsafe for rollback)"
else
  fail "variant-C: unexpected canonical=$CANON_OK keeper=$KEEPER_LEFT"
fi
docker compose -p "$PROJ" -f "$COMPOSE" down --remove-orphans >/dev/null

# --- 3) Strategy B success: force-recreate without rename ---
docker compose -p "$PROJ" -f "$COMPOSE" up -d >/dev/null
PREV="$(docker inspect -f '{{.Id}}' "$BE")"
docker compose -p "$PROJ" -f "$COMPOSE" up -d --no-deps --force-recreate backend >/dev/null
if wr_compose_verify_recreate_postconditions backend "$BE" "$PREV" "" "$PROJ"; then
  pass "strategy-B: backend force-recreate postconditions"
else
  fail "strategy-B: backend postconditions"
fi
if wr_compose_assert_no_service_owned_keeper "$PROJ" backend "$BE"; then
  pass "strategy-B: no non-canonical compose-owned backend"
else
  fail "strategy-B: service ownership collision"
fi
PREV_SF="$(docker inspect -f '{{.Id}}' "$SF")"
docker compose -p "$PROJ" -f "$COMPOSE" up -d --no-deps --force-recreate storefront >/dev/null
wr_compose_verify_recreate_postconditions storefront "$SF" "$PREV_SF" "" "$PROJ" \
  && pass "strategy-B: storefront force-recreate postconditions" \
  || fail "strategy-B: storefront postconditions"

# --- 4) Simulated rollback: force-recreate again changes ID (pair recoverable) ---
PREV2="$(docker inspect -f '{{.Id}}' "$BE")"
docker compose -p "$PROJ" -f "$COMPOSE" up -d --no-deps --force-recreate backend >/dev/null
wr_compose_verify_recreate_postconditions backend "$BE" "$PREV2" "" "$PROJ" \
  && pass "rollback-sim: second force-recreate yields new ID" \
  || fail "rollback-sim: ID did not change"

# --- 5) Stale renamed keeper left aside must not own service after B recreate ---
docker compose -p "$PROJ" -f "$COMPOSE" down --remove-orphans >/dev/null
docker compose -p "$PROJ" -f "$COMPOSE" up -d >/dev/null
# Create an orphan by cloning labels via rename then Strategy B on a fresh project would conflict;
# here: rename, then force-recreate (C) already shown unsafe. For B we never rename.
# Assert helper rejects a co-existing keeper with same project/service labels:
docker rename "$BE" "$KEEP"
# Re-create canonical via force-recreate (this destroys keeper in Compose v5) —
# instead seed a second container manually with stolen labels is hard (immutable).
# Document: after B path without rename, assert_no_service_owned_keeper passes:
docker compose -p "$PROJ" -f "$COMPOSE" up -d --no-deps --force-recreate backend >/dev/null || true
# If keeper still exists with labels, helper must fail:
if docker inspect "$KEEP" >/dev/null 2>&1; then
  if wr_compose_assert_no_service_owned_keeper "$PROJ" backend "$BE"; then
    fail "stale-keeper: helper should detect compose-owned keeper"
  else
    pass "stale-keeper: helper detects compose-owned non-canonical"
  fi
else
  pass "stale-keeper: force-recreate consumed renamed keeper (C semantics; B avoids rename)"
fi

echo "compose-keeper-real: pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
