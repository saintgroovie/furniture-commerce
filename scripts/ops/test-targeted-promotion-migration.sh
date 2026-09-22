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
json.dump({"environment":"public_production","db":{"name":"woodright_public_production","sha256":"$MIG_SHA"}}, open("$TMP/backup.json","w"))
PY
  rm -f "$TMP/fix/plan.json" "$TMP/fix/executed"
}

run() {
  reset_fixture
  set +e
  WOODRIGHT_TARGETED_MIGRATION_TEST=1 \
  WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR="$TMP/fix" \
  WOODRIGHT_GOVERNANCE_MARKER="$TMP/marker" \
  DATABASE_URL="postgres://rehearsal:secret@127.0.0.1:5432/woodright_public_production" \
  bash "$SCRIPT" "$@" >"$TMP/out" 2>"$TMP/err"
  RC=$?
  set -e
}

run --environment public_production --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode dry-run
[[ "$RC" -eq 0 && -f "$TMP/out" && "$(cat "$TMP/out")" == DRY_RUN_OK* && ! -f "$TMP/fix/executed" ]] \
  && pass "dry-run: no mutation" || fail "dry-run rc=$RC"

run --environment staging --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "wrong environment refused" || fail "wrong environment rc=$RC"

reset_fixture
printf '%s\n' woodright_staging >"$TMP/fix/database"
set +e
WOODRIGHT_TARGETED_MIGRATION_TEST=1 \
WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR="$TMP/fix" \
WOODRIGHT_GOVERNANCE_MARKER="$TMP/marker" \
DATABASE_URL="postgres://rehearsal:secret@127.0.0.1:5432/woodright_public_production" \
bash "$SCRIPT" --environment public_production --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$TOKEN" >"$TMP/out" 2>"$TMP/err"
RC=$?
set -e
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "wrong database refused" || fail "wrong database rc=$RC"

reset_fixture
printf '%s\n' Migration20260908120000 >"$TMP/fix/applied"
set +e
WOODRIGHT_TARGETED_MIGRATION_TEST=1 \
WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR="$TMP/fix" \
WOODRIGHT_GOVERNANCE_MARKER="$TMP/marker" \
DATABASE_URL="postgres://rehearsal:secret@127.0.0.1:5432/woodright_public_production" \
bash "$SCRIPT" --environment public_production --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$TOKEN" >"$TMP/out" 2>"$TMP/err"
RC=$?
set -e
grep -q ALREADY_APPLIED "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "already applied refused" || fail "already applied rc=$RC"

run --environment public_production --migration Migration20250505101505 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "unknown and destructive migration refused" || fail "destructive migration rc=$RC"

reset_fixture
printf '%s\n' promotion_slot >"$TMP/fix/regclass"
set +e
WOODRIGHT_TARGETED_MIGRATION_TEST=1 \
WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR="$TMP/fix" \
WOODRIGHT_GOVERNANCE_MARKER="$TMP/marker" \
DATABASE_URL="postgres://rehearsal:secret@127.0.0.1:5432/woodright_public_production" \
bash "$SCRIPT" --environment public_production --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$TOKEN" >"$TMP/out" 2>"$TMP/err"
RC=$?
set -e
grep -q partial "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "partial promotion_slot refused" || fail "partial rc=$RC"

run --environment public_production --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-public-production-postgres \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "rehearsal refuses live postgres" || fail "live container rc=$RC"

run --environment public_production --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "execute without confirmation refused" || fail "missing confirm rc=$RC"

run --environment public_production --migration Migration20260908120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-promotion-slot \
  --application-sha "$SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$TOKEN"
[[ "$RC" -eq 0 ]] && grep -q Migration20260908120000 "$TMP/fix/plan.json" \
  && ! grep -q Migration20250505101505 "$TMP/fix/plan.json" \
  && [[ "$(cat "$TMP/fix/executed")" == Migration20260908120000 ]] \
  && pass "execute selects only the promotion migration" || fail "execute selection rc=$RC"

node --test "$ROOT/scripts/ops/test-targeted-promotion-migration-options.cjs"
pass "framework options unit test"

if [[ "$FAIL" -eq 0 ]]; then
  echo "OK targeted promotion migration guards"
  exit 0
fi
echo "FAILED count=$FAIL"
exit 1
