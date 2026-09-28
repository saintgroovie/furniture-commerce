#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/release/woodright-targeted-migration.sh"
RUNNER="$ROOT/ops/release/woodright-targeted-migration.cjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL %s\n' "$1"; }

SHA="931140158756b921100e4f97cf1f27cd3ba61bc2"
GOV="39fe9dc37a9c267352292e100169faa3c5eae263"
MIG_SHA="e5e3ecdfa91af6680f848585c94e93599d9cd7d6f6671ff4b2bc90d0d2f0fdb1"
TOKEN="I_UNDERSTAND_REHEARSAL_TARGETED_MIGRATION"
BASE=(
  --environment public_production
  --migration Migration20260908120000
  --runtime-scope rehearsal
  --postgres-container woodright-rehearsal-promotion-slot
  --application-sha "$SHA"
  --governance-sha "$GOV"
  --backup-manifest "$TMP/backup.json"
  --backend-image rehearsal-image
)

reset_fixture() {
  rm -rf "$TMP/fix"
  mkdir -p "$TMP/fix"
  printf '%s\n' woodright_public_production >"$TMP/fix/database"
  printf '%s\n' "" >"$TMP/fix/applied"
  printf '%s\n' "" >"$TMP/fix/regclass"
  printf '%s\n' "PRIMARY KEY (workflow_id, transaction_id, run_id)" >"$TMP/fix/pk"
  printf '%s\n' "$SHA" >"$TMP/fix/app-sha"
  printf '%s\n' "$MIG_SHA" >"$TMP/fix/migration-sha"
  printf '%s\n' "$GOV" >"$TMP/marker"
  python3 - <<PY
import json
json.dump({
  "schema": "woodright_recovery_point_v2",
  "environment": "public_production",
  "application_sha": "$SHA",
  "db": {"name": "woodright_public_production", "sha256": "$MIG_SHA"},
}, open("$TMP/backup.json", "w"))
PY
  rm -f "$TMP/fix/plan.json" "$TMP/fix/executed"
}

invoke() {
  set +e
  WOODRIGHT_TARGETED_MIGRATION_TEST=1 \
  WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR="$TMP/fix" \
  WOODRIGHT_GOVERNANCE_MARKER="$TMP/marker" \
  bash "$SCRIPT" "$@" >"$TMP/out" 2>"$TMP/err"
  RC=$?
  set -e
}

run() {
  reset_fixture
  invoke "$@"
}

grep -q '^# LIVE_MUTATING=true$' "$SCRIPT" && pass "declares LIVE_MUTATING" || fail "LIVE_MUTATING header"
grep -q '/srv/woodright/locks/public_production/live-cutover.lock' "$SCRIPT" \
  && grep -q 'flock' "$SCRIPT" && pass "names the production lock" || fail "canonical lock"
grep -q '/server/src/modules/promotion-slot/migrations' "$SCRIPT" \
  && ! grep -q 'workflow-engine-redis/dist/migrations' "$SCRIPT" \
  && pass "shell discovery is promotion-slot only" || fail "discovery scope"
! grep -q 'medusa db:migrate' "$SCRIPT" && pass "no full migrate fallback" || fail "full migrate fallback"

run "${BASE[@]}" --mode dry-run
[[ "$RC" -eq 0 && "$(cat "$TMP/out")" == DRY_RUN_OK* && ! -f "$TMP/fix/executed" ]] \
  && pass "dry-run: no mutation" || fail "dry-run rc=$RC"

run --environment staging --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "wrong environment refused" || fail "wrong environment rc=$RC"

reset_fixture
printf '%s\n' woodright_staging >"$TMP/fix/database"
invoke "${BASE[@]}" --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "wrong database refused" || fail "wrong database rc=$RC"

reset_fixture
printf '%s\n' Migration20260908120000 >"$TMP/fix/applied"
printf '%s\n' promotion_slot >"$TMP/fix/regclass"
invoke "${BASE[@]}" --mode execute --confirm "$TOKEN"
grep -q ALREADY_APPLIED "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "already applied refused" || fail "already applied rc=$RC"

reset_fixture
printf '%s\n' Migration20260908120000 >"$TMP/fix/applied"
invoke "${BASE[@]}" --mode execute --confirm "$TOKEN"
grep -q BOOKKEEPING_WITHOUT_TABLE "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] \
  && pass "bookkeeping without table refused" || fail "bookkeeping without table rc=$RC"

run "${BASE[@]}" --migration Migration20250505101505 --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "destructive migration refused" || fail "destructive migration rc=$RC"

run "${BASE[@]}" --migration Migration19990101000000 --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "unknown migration refused" || fail "unknown migration rc=$RC"

reset_fixture
printf '%s\n' promotion_slot >"$TMP/fix/regclass"
invoke "${BASE[@]}" --mode execute --confirm "$TOKEN"
grep -q partial "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "partial promotion_slot refused" || fail "partial rc=$RC"

run "${BASE[@]}" --postgres-container woodright-public-production-postgres --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "rehearsal refuses live postgres" || fail "live container rc=$RC"

run "${BASE[@]}" --postgres-container 'woodright-rehearsal-promotion-slot;touch' --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "container name refused" || fail "container name rc=$RC"

run "${BASE[@]}" --mode execute
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "execute without confirmation refused" || fail "missing confirm rc=$RC"

run "${BASE[@]}" --application-sha 0000000000000000000000000000000000000000 --mode execute --confirm "$TOKEN"
grep -q 'application SHA refused' "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "wrong application SHA refused" || fail "app sha rc=$RC"

reset_fixture
printf '%s\n' 0000000000000000000000000000000000000000 >"$TMP/marker"
invoke "${BASE[@]}" --mode execute --confirm "$TOKEN"
grep -q 'governance marker does not match' "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] \
  && pass "wrong governance marker refused" || fail "governance rc=$RC"

run "${BASE[@]}" --backup-manifest "$TMP/missing.json" --mode dry-run
grep -q 'backup manifest missing' "$TMP/err" && pass "missing backup manifest refused" || fail "missing manifest rc=$RC"

reset_fixture
printf '%s\n' '{' >"$TMP/backup.json"
invoke "${BASE[@]}" --mode dry-run
[[ "$RC" -ne 0 ]] && pass "malformed backup manifest refused" || fail "malformed manifest rc=$RC"

reset_fixture
python3 - <<PY
import json
json.dump({
  "schema": "woodright_recovery_point_v2",
  "environment": "public_demo",
  "application_sha": "$SHA",
  "db": {"name": "woodright_public_production", "sha256": "$MIG_SHA"},
}, open("$TMP/backup.json", "w"))
PY
invoke "${BASE[@]}" --mode dry-run
grep -q 'backup environment mismatch' "$TMP/err" && pass "backup environment refused" || fail "backup env rc=$RC"

reset_fixture
python3 - <<PY
import json
json.dump({
  "schema": "woodright_recovery_point_v2",
  "environment": "public_production",
  "application_sha": "$SHA",
  "db": {"name": "woodright_public_production", "sha256": "zzzz"},
}, open("$TMP/backup.json", "w"))
PY
invoke "${BASE[@]}" --mode dry-run
grep -q 'backup db checksum missing' "$TMP/err" && pass "bad backup checksum refused" || fail "checksum rc=$RC"

reset_fixture
python3 - <<PY
import json
json.dump({
  "schema": "woodright_recovery_point_v2",
  "environment": "public_production",
  "application_sha": "not-a-sha",
  "db": {"name": "woodright_public_production", "sha256": "$MIG_SHA"},
}, open("$TMP/backup.json", "w"))
PY
invoke "${BASE[@]}" --mode dry-run
grep -q 'backup application SHA missing' "$TMP/err" && pass "bad backup application SHA refused" || fail "backup app sha rc=$RC"

run "${BASE[@]}" --mode execute --confirm "$TOKEN"
[[ "$RC" -eq 0 ]] && grep -q Migration20260908120000 "$TMP/fix/plan.json" \
  && grep -q '/server/src/modules/promotion-slot/migrations' "$TMP/fix/plan.json" \
  && ! grep -q Migration20250505101505 "$TMP/fix/plan.json" \
  && ! grep -q workflow-engine-redis "$TMP/fix/plan.json" \
  && [[ "$(cat "$TMP/fix/executed")" == Migration20260908120000 ]] \
  && pass "execute selects only the promotion migration" || fail "execute selection rc=$RC"

node --test "$ROOT/scripts/ops/test-targeted-promotion-migration-options.cjs"
pass "framework options unit test"

mkdir -p "$TMP/policy"
cp "$SCRIPT" "$TMP/policy/"
( cd "$ROOT" && node scripts/release/check-global-lock-policy.cjs "$TMP/policy" >/dev/null )
pass "global lock policy"

if [[ "$FAIL" -eq 0 ]]; then
  echo "OK targeted promotion migration guards"
  exit 0
fi
echo "FAILED count=$FAIL"
exit 1
