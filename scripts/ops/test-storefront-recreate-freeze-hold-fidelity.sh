#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bash -n "$ROOT/ops/release/recreate-staging-storefront.sh"
bash -n "$ROOT/ops/lib/woodright-hold-validation-freeze.sh"
# Official SF recreate must not copy previous container Labels dict into create body.
! grep -q 'labels=dict(cfg.get("Labels")' "$ROOT/ops/release/recreate-staging-storefront.sh"
grep -q 'wr_validation_freeze_assert_clear_for_mutation' "$ROOT/ops/release/recreate-staging-storefront.sh"
grep -q 'com.woodright.release-sha' "$ROOT/ops/release/recreate-staging-storefront.sh"
grep -q 'fcntl' "$ROOT/ops/lib/woodright-hold-validation-freeze.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export WOODRIGHT_VALIDATION_FREEZE_DIR="$TMP/locks"
mkdir -p "$WOODRIGHT_VALIDATION_FREEZE_DIR" "$TMP/own" "$TMP/outside"
# shellcheck source=../../ops/lib/woodright-hold-validation-freeze.sh
source "$ROOT/ops/lib/woodright-hold-validation-freeze.sh"

wr_validation_freeze_acquire staging actor-a cycle-a reason-a 60
if wr_validation_freeze_acquire_owned staging actor-b cycle-b reason-b 60 2>"$TMP/foreign.err"; then
  echo "FAIL expected foreign acquire refusal"; exit 1
fi
grep -Eq 'refuse overwrite|another holder' "$TMP/foreign.err"

if wr_validation_freeze_acquire_owned staging actor-a cycle-a reason-a 60 777001 2>"$TMP/pid.err"; then
  echo "FAIL expected same-cycle different-pid refusal"; exit 1
fi
grep -Eq 'refuse overwrite|another holder' "$TMP/pid.err"

hostile='x; echo PWNED >'"$TMP"'/pwned; #'
wr_validation_freeze_acquire_owned staging "$hostile" "cycle-hostile" "reason; rm -rf /" 60 "$$" 2>"$TMP/hostile.err" || true
[[ ! -f "$TMP/pwned" ]] || { echo "FAIL shell injection via metadata"; exit 1; }

if wr_validation_freeze_release_owned staging actor-a cycle-a 999999 2>"$TMP/rel.err"; then
  echo "FAIL expected ownership mismatch release refusal"; exit 1
fi
grep -q 'ownership match' "$TMP/rel.err"
PID="$(python3 -c 'import json;print(json.load(open("'"$WOODRIGHT_VALIDATION_FREEZE_DIR"'/validation-freeze-staging.lease"))["pid"])')"
wr_validation_freeze_release_owned staging actor-a cycle-a "$PID"
rm -f "$WOODRIGHT_VALIDATION_FREEZE_DIR/validation-freeze-staging.lease"

set +e
wr_hold_validation_freeze_for_command staging hold-actor hold-cycle hold-reason 60 -- bash -c 'exit 42'
rc=$?
set -e
[[ "$rc" -eq 42 ]] || { echo "FAIL status want=42 got=$rc"; exit 1; }
[[ ! -f "$WOODRIGHT_VALIDATION_FREEZE_DIR/validation-freeze-staging.lease" ]] || {
  echo "FAIL lease not released"; exit 1
}
case $- in *e*) ;; *) echo "FAIL errexit not restored"; exit 1 ;; esac

printf 'WOODRIGHT_EXPOSURE=public\n' >"$TMP/outside/prod.env"
chmod 600 "$TMP/outside/prod.env"
ln -s "$TMP/outside/prod.env" "$TMP/own/escape.env"
OWNER_ROOT="$(realpath "$TMP/own")"
ENV_REAL="$(realpath "$TMP/own/escape.env")"
case "$ENV_REAL" in
  "$OWNER_ROOT"/*) echo "FAIL symlink escape not detected"; exit 1 ;;
esac

echo PASS_storefront_recreate_freeze_hold_fidelity
