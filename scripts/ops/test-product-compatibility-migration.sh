#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/ops/release/woodright-product-compatibility-migration.sh"
RUNNER="$ROOT/scripts/ops/test-product-compatibility-migration-options.cjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL %s\n' "$1"; }

LIVE_SHA="01d8fd57c4b33868be116f09a7a2814f437c43c4"
LIVE_BE_DIGEST="sha256:8c23319c07dd83d7078aae13df5912322df4de0a39ee45b4d561e3b6156152d6"
LIVE_BE_ID="sha256:b9451cd0e1bf9c212781d628c86425c2598e4e8e01bb1ab3a30e368693e1b517"
SF_SHA="9e44d44015d1a3f1bcd259fca4b8ef09d5b6d4d5"
SF_DIGEST="sha256:e4288d7bff8a119ad31051b5cfa4dd7f2f5de0874e2668ad84ddc84f77862b93"
SF_ID="sha256:a448fda12beefa50b0b4484b9d1257690e72e59a854d1579568c7e515b5b14b7"
IMAGE_SHA="5aa0c2c7818a42f56d52311c5149222c18d82427"
IMAGE_DIGEST="sha256:d087b0541ccf846fa7ef1d23108e1f488b20ff47c334a9614746d5047b5c62f3"
MIG_SHA="51ef408272c219feddd628497c92bbe1fe75476844f9ea67dd8f01664d901082"
GOV="39fe9dc37a9c267352292e100169faa3c5eae263"
REHEARSAL_TOKEN="I_UNDERSTAND_REHEARSAL_PRODUCT_COMPATIBILITY_MIGRATION"
LIVE_TOKEN="I_UNDERSTAND_LIVE_PUBLIC_PRODUCTION_PRODUCT_COMPATIBILITY_MIGRATION"
BASE=(
  --environment public_production
  --migration Migration20261005120000
  --runtime-scope rehearsal
  --postgres-container woodright-rehearsal-product-compatibility
  --live-application-sha "$LIVE_SHA"
  --governance-sha "$GOV"
  --backup-manifest "$TMP/backup.json"
  --backend-image rehearsal-image
)

reset_fixture() {
  rm -rf "$TMP/fix"
  mkdir -p "$TMP/fix"
  printf '%s\n' woodright_rehearsal_product_compatibility >"$TMP/fix/database"
  printf '%s\n' "" >"$TMP/fix/applied"
  printf '%s\n' "" >"$TMP/fix/regclass"
  printf '%s\n' 185 >"$TMP/fix/migration-count"
  printf '%s\n' 0 >"$TMP/fix/dangerous-count"
  printf '%s\n' ready >"$TMP/fix/lock-ready"
  printf '%s\n' "$IMAGE_SHA" >"$TMP/fix/app-sha"
  printf '%s\n' "$IMAGE_DIGEST" >"$TMP/fix/image-digest"
  printf '%s\n' "$MIG_SHA" >"$TMP/fix/migration-sha"
  printf '%s\n' "$LIVE_SHA" >"$TMP/fix/live-backend-revision"
  printf '%s\n' "$SF_SHA" >"$TMP/fix/live-storefront-revision"
  printf '%s\n' "$LIVE_BE_DIGEST" >"$TMP/fix/live-backend-digest"
  printf '%s\n' "$SF_DIGEST" >"$TMP/fix/live-storefront-digest"
  printf '%s\n' "$GOV" >"$TMP/marker"
  python3 - <<PY
import datetime, json
created = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
json.dump({
  "kind": "woodright_recovery_point",
  "schema": "woodright_recovery_point_v2",
  "status": "success",
  "partial": False,
  "verification_status": "pending_rehearsal",
  "created_at_utc": created,
  "environment": "public_production",
  "application_sha": "$SF_SHA",
  "backend_digest": "$LIVE_BE_ID",
  "storefront_digest": "$SF_ID",
  "db": {
    "name": "woodright_public_production",
    "sha256": "$MIG_SHA",
    "size_bytes": 100,
  },
}, open("$TMP/backup.json", "w"))
PY
  rm -f "$TMP/fix/plan.json" "$TMP/fix/executed"
}

invoke() {
  set +e
  WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST=1 \
  WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR="$TMP/fix" \
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
grep -q '/server/src/modules/product-compatibility/migrations' "$SCRIPT" \
  && ! grep -q 'workflow-engine-redis/dist/migrations' "$SCRIPT" \
  && pass "shell discovery is product-compatibility only" || fail "discovery scope"
! grep -q 'medusa db:migrate' "$SCRIPT" && pass "no full migrate fallback" || fail "full migrate fallback"
git -C "$ROOT" diff --exit-code -- ops/release/woodright-targeted-migration.sh ops/release/woodright-targeted-migration.cjs \
  && pass "promotion runner unchanged" || fail "promotion runner changed"

run "${BASE[@]}" --mode dry-run
[[ "$RC" -eq 0 && "$(tail -n 1 "$TMP/out")" == DRY_RUN_OK* && ! -f "$TMP/fix/executed" ]] \
  && python3 -c 'import json,sys; d=json.loads(open(sys.argv[1]).read().splitlines()[0]); assert d["mutation"] is False and d["migration"]=="Migration20261005120000" and d["table"]=="absent"' "$TMP/out" \
  && pass "dry-run: no mutation" || fail "dry-run rc=$RC"

run --environment local --migration Migration20261005120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-product-compatibility \
  --live-application-sha "$LIVE_SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$REHEARSAL_TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "local environment refused" || fail "local environment rc=$RC"

run --environment public_demo --migration Migration20261005120000 \
  --runtime-scope rehearsal --postgres-container woodright-rehearsal-product-compatibility \
  --live-application-sha "$LIVE_SHA" --governance-sha "$GOV" --backup-manifest "$TMP/backup.json" \
  --backend-image rehearsal-image --mode execute --confirm "$REHEARSAL_TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "demo environment refused" || fail "demo environment rc=$RC"

reset_fixture
printf '%s\n' woodright_public_production >"$TMP/fix/database"
invoke "${BASE[@]}" --mode execute --confirm "$REHEARSAL_TOKEN"
grep -q 'database identity refused' "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "rehearsal refuses production database" || fail "rehearsal db rc=$RC"

reset_fixture
printf '%s\n' woodright_rehearsal_product_compatibility >"$TMP/fix/database"
invoke "${BASE[@]}" --runtime-scope live --postgres-container woodright-public-production-postgres --mode dry-run
grep -q 'database identity refused' "$TMP/err" && pass "live refuses rehearsal database" || fail "live db rc=$RC"

reset_fixture
printf '%s\n' Migration20261005120000 >"$TMP/fix/applied"
printf '%s\n' product_compatibility >"$TMP/fix/regclass"
invoke "${BASE[@]}" --mode execute --confirm "$REHEARSAL_TOKEN"
grep -q ALREADY_APPLIED "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "already applied refused" || fail "already applied rc=$RC"

reset_fixture
printf '%s\n' Migration20261005120000 >"$TMP/fix/applied"
invoke "${BASE[@]}" --mode dry-run
grep -q BOOKKEEPING_WITHOUT_TABLE "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] \
  && pass "bookkeeping without table refused" || fail "bookkeeping without table rc=$RC"

reset_fixture
printf '%s\n' product_compatibility >"$TMP/fix/regclass"
invoke "${BASE[@]}" --mode execute --confirm "$REHEARSAL_TOKEN"
grep -q PARTIAL_SCHEMA "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "partial schema refused" || fail "partial rc=$RC"

reset_fixture
printf '%s\n' 1 >"$TMP/fix/dangerous-count"
invoke "${BASE[@]}" --mode execute --confirm "$REHEARSAL_TOKEN"
grep -q DANGEROUS_MIGRATION_PRESENT "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] \
  && pass "dangerous migration present refused" || fail "dangerous present rc=$RC"

run "${BASE[@]}" --migration Migration20250505101505 --mode execute --confirm "$REHEARSAL_TOKEN"
grep -q REFUSED_TARGETED_MIGRATION_NOT_ALLOWED "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] \
  && pass "destructive migration name refused" || fail "destructive migration rc=$RC"

run "${BASE[@]}" --migration Migration20260908120000 --mode execute --confirm "$REHEARSAL_TOKEN"
grep -q REFUSED_TARGETED_MIGRATION_NOT_ALLOWED "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] \
  && pass "promotion migration name refused" || fail "promotion name rc=$RC"

run "${BASE[@]}" --postgres-container woodright-public-production-postgres --mode execute --confirm "$REHEARSAL_TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "rehearsal refuses live postgres" || fail "live container rc=$RC"

run "${BASE[@]}" --postgres-container woodright-local-postgres --mode execute --confirm "$REHEARSAL_TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "local container name refused" || fail "local container rc=$RC"

run "${BASE[@]}" --mode execute
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "execute without confirmation refused" || fail "missing confirm rc=$RC"

run "${BASE[@]}" --mode execute --confirm yes
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "generic yes refused" || fail "generic yes rc=$RC"

run "${BASE[@]}" --mode execute --confirm "$LIVE_TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "live token refused in rehearsal" || fail "live token rehearsal rc=$RC"

run "${BASE[@]}" --runtime-scope live --postgres-container woodright-public-production-postgres --mode execute --confirm "$REHEARSAL_TOKEN"
[[ "$RC" -ne 0 && ! -f "$TMP/fix/executed" ]] && pass "rehearsal token refused in live" || fail "rehearsal token live rc=$RC"

run "${BASE[@]}" --live-application-sha 0000000000000000000000000000000000000000 --mode execute --confirm "$REHEARSAL_TOKEN"
grep -q LIVE_APPLICATION_SHA_REFUSED "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "wrong live SHA refused" || fail "live sha rc=$RC"

reset_fixture
printf '%s\n' 5aa0c2c7818a42f56d52311c5149222c18d82427 >"$TMP/fix/live-backend-revision"
invoke "${BASE[@]}" --mode dry-run
grep -q LIVE_APPLICATION_DRIFT "$TMP/err" && pass "drifted live backend refused" || fail "drift rc=$RC"

reset_fixture
printf '%s\n' 'sha256:0000000000000000000000000000000000000000000000000000000000000000' >"$TMP/fix/migration-sha"
invoke "${BASE[@]}" --mode dry-run
grep -q 'migration source hash mismatch' "$TMP/err" && pass "migration hash mismatch refused" || fail "hash rc=$RC"

reset_fixture
printf '%s\n' 'sha256:0000000000000000000000000000000000000000000000000000000000000000' >"$TMP/fix/image-digest"
invoke "${BASE[@]}" --mode dry-run
grep -q 'migration image digest mismatch' "$TMP/err" && pass "wrong candidate digest refused" || fail "digest rc=$RC"

reset_fixture
printf '%s\n' missing >"$TMP/fix/lock-ready"
invoke "${BASE[@]}" --mode dry-run
grep -q LOCK_NOT_READY "$TMP/err" && [[ ! -f "$TMP/fix/executed" ]] && pass "lock not ready refused" || fail "lock rc=$RC"

run "${BASE[@]}" --backup-manifest "$TMP/missing.json" --mode dry-run
grep -q 'backup manifest missing' "$TMP/err" && pass "missing backup manifest refused" || fail "missing manifest rc=$RC"

reset_fixture
python3 - <<PY
import json
path = "$TMP/backup.json"
doc = json.load(open(path))
doc["status"] = "failed"
json.dump(doc, open(path, "w"))
PY
invoke "${BASE[@]}" --mode dry-run
grep -q 'backup status refused' "$TMP/err" && pass "failed recovery point refused" || fail "failed backup rc=$RC"

reset_fixture
python3 - <<PY
import json
path = "$TMP/backup.json"
doc = json.load(open(path))
doc["partial"] = True
json.dump(doc, open(path, "w"))
PY
invoke "${BASE[@]}" --mode dry-run
grep -q 'backup partial refused' "$TMP/err" && pass "partial recovery point refused" || fail "partial backup rc=$RC"

reset_fixture
python3 - <<PY
import json
path = "$TMP/backup.json"
doc = json.load(open(path))
doc["db"]["size_bytes"] = 0
json.dump(doc, open(path, "w"))
PY
invoke "${BASE[@]}" --mode dry-run
grep -q 'backup db size refused' "$TMP/err" && pass "empty backup size refused" || fail "size rc=$RC"

reset_fixture
python3 - <<PY
import json
path = "$TMP/backup.json"
doc = json.load(open(path))
doc["created_at_utc"] = "20200101T000000Z"
json.dump(doc, open(path, "w"))
PY
invoke "${BASE[@]}" --mode dry-run
grep -q 'backup freshness refused' "$TMP/err" && pass "stale recovery point refused" || fail "stale backup rc=$RC"

reset_fixture
python3 - <<PY
import json
path = "$TMP/backup.json"
doc = json.load(open(path))
doc["application_sha"] = "$LIVE_SHA"
json.dump(doc, open(path, "w"))
PY
invoke "${BASE[@]}" --mode dry-run
grep -q 'backup application SHA mismatch' "$TMP/err" && pass "backup SHA must be the storefront revision" || fail "backup app sha rc=$RC"

run "${BASE[@]}" --mode execute --confirm "$REHEARSAL_TOKEN"
[[ "$RC" -eq 0 ]] && grep -q Migration20261005120000 "$TMP/fix/plan.json" \
  && grep -q '/server/src/modules/product-compatibility/migrations' "$TMP/fix/plan.json" \
  && ! grep -q Migration20250505101505 "$TMP/fix/plan.json" \
  && ! grep -q workflow-engine-redis "$TMP/fix/plan.json" \
  && ! grep -q promotion-slot "$TMP/fix/plan.json" \
  && [[ "$(cat "$TMP/fix/executed")" == Migration20261005120000 ]] \
  && pass "execute selects only the compatibility migration" || fail "execute selection rc=$RC"

node --test "$RUNNER"
pass "framework options unit test"

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
sh = (root / "ops/release/woodright-product-compatibility-migration.sh").read_text()
cjs = (root / "ops/release/woodright-product-compatibility-migration.cjs").read_text()
assert "migrations.revert" not in cjs
assert "medusa db:migrate" not in sh
assert "medusa db:migrate" not in cjs
acquire = sh.index("  wr_staging_mutation_lock_acquire \\\n")
after = sh[acquire:]
assert "assert_database_gate" in after
assert 'container:${PG_EXEC}' in after
exit_fn = sh.index("on_migration_exit()")
wait_at = sh.index("wait_until_migration_stopped", exit_fn)
release_at = sh.index("wr_staging_mutation_lock_release", exit_fn)
assert wait_at < release_at
PY
pass "no override path and lock waits for container stop"

mkdir -p "$TMP/policy"
cp "$SCRIPT" "$TMP/policy/"
( cd "$ROOT" && node scripts/release/check-global-lock-policy.cjs "$TMP/policy" >/dev/null )
pass "global lock policy"

awk '/# BEGIN MIGRATION_CONTAINER_GUARD/,/# END MIGRATION_CONTAINER_GUARD/' "$SCRIPT" >"$TMP/guard.sh"
mkdir -p "$TMP/bin"
cat >"$TMP/bin/docker" <<'EOF'
#!/bin/bash
mode="$(cat "$DOCKER_MODE")"
if [[ "$1" == "inspect" ]]; then
  if [[ "$mode" == "absent" ]]; then
    echo "Error: No such container: test" >&2
    exit 1
  fi
  if [[ "$mode" == "blip" ]]; then
    echo "Error: request returned Internal Server Error" >&2
    exit 1
  fi
  printf '%s\n' "$mode"
  exit 0
fi
if [[ "$1" == "rm" ]]; then
  printf '%s\n' absent >"$DOCKER_MODE"
  exit 0
fi
if [[ "$1" == "kill" && "$mode" == "running" ]]; then
  printf '%s\n' exited >"$DOCKER_MODE"
fi
exit 0
EOF
chmod +x "$TMP/bin/docker"
DOCKER_MODE="$TMP/docker-mode" PATH="$TMP/bin:$PATH" bash -c '
set -euo pipefail
log() { :; }
source "$1"
MIGRATION_NAME="woodright-product-compatibility-migration-test"
printf "%s\n" running >"$DOCKER_MODE"
stop_migration_container
[[ -z "$MIGRATION_NAME" ]]
' bash "$TMP/guard.sh"
pass "lock cleanup removes a stopped migration container"

if [[ "$FAIL" -eq 0 ]]; then
  echo "OK targeted product compatibility migration guards"
  exit 0
fi
echo "FAILED count=$FAIL"
exit 1
