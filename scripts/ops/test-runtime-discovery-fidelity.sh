#!/usr/bin/env bash
# Fidelity tests: runtime discovery + media promotion gate (no live mutation).
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DISC="$ROOT/ops/lib/woodright-runtime-discovery.sh"
GATE="$ROOT/ops/release/verify-backend-media-mount.sh"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL+1)); }

bash -n "$DISC" && pass "syntax discovery" || fail "syntax discovery"
bash -n "$GATE" && pass "syntax gate" || fail "syntax gate"
bash -n "$ROOT/ops/backup/woodright-media-backup.sh" && pass "syntax media-backup" || fail "syntax media-backup"
bash -n "$ROOT/ops/backup/woodright-backup-run.sh" && pass "syntax backup-run" || fail "syntax backup-run"

# Hardcoded ephemeral compose defaults must be gone
if grep -n 'woodright-stack-3dsdhd-backend-1' "$ROOT/ops/backup/"*.sh "$ROOT/ops/monitoring/"*.sh; then
  fail "stale backend default still present"
else
  pass "no woodright-stack-3dsdhd-backend-1 default"
fi
if grep -n 'woodright-stack-3dsdhd-storefront-1' "$ROOT/ops/backup/"*.sh; then
  fail "stale storefront default still present in backup"
else
  pass "no woodright-stack-3dsdhd-storefront-1 in backup scripts"
fi

# Discovery sourced; no mutating docker verbs in discovery lib
if grep -EEn 'docker[[:space:]]+(run|create|rm|kill|restart|compose)' "$DISC" | grep -vE '^\s*#|inspect|ps'; then
  fail "discovery mutates docker"
else
  pass "discovery read-only docker surface"
fi

# Gate must not write manifests
if grep -En 'ACTIVE_OWNER|EXPECTED_RELEASE' "$GATE" | grep -E '>|tee|cp |mv |install '; then
  fail "gate writes manifests"
else
  pass "gate does not write manifests"
fi

# Compose-only gate against repo compose
if "$GATE" --compose-only --compose-file "$ROOT/docker-compose.staging.yml" >/tmp/wr-gate-compose.json; then
  grep -q '"ok": true' /tmp/wr-gate-compose.json && pass "compose-only gate" || fail "compose-only json"
else
  fail "compose-only gate exit"
fi

# Fixture gates
FX="$ROOT/scripts/ops/fixtures/media-gate"
mkdir -p "$FX"/{pass,empty,wrong-vol,ro-mount,no-mount,no-jpeg,ps404}

cat >"$FX/pass/gate.json" <<'JSON'
{"mounts":[{"Name":"woodright-stack-3dsdhd_woodright_staging_media","Destination":"/server/static","RW":true}],"file_count":6835,"byte_size":500000000,"has_jpeg":true,"has_webp":true,"product_static_status":200}
JSON
cat >"$FX/empty/gate.json" <<'JSON'
{"mounts":[{"Name":"woodright-stack-3dsdhd_woodright_staging_media","Destination":"/server/static","RW":true}],"file_count":0,"byte_size":0,"has_jpeg":false,"has_webp":false}
JSON
cat >"$FX/wrong-vol/gate.json" <<'JSON'
{"mounts":[{"Name":"woodright-staging_woodright_staging_media","Destination":"/server/static","RW":true}],"file_count":1000,"byte_size":5000000,"has_jpeg":true,"has_webp":true}
JSON
cat >"$FX/ro-mount/gate.json" <<'JSON'
{"mounts":[{"Name":"woodright-stack-3dsdhd_woodright_staging_media","Destination":"/server/static","RW":false}],"file_count":1000,"byte_size":5000000,"has_jpeg":true,"has_webp":true}
JSON
cat >"$FX/no-mount/gate.json" <<'JSON'
{"mounts":[],"file_count":0,"byte_size":0,"has_jpeg":false,"has_webp":false}
JSON
cat >"$FX/no-jpeg/gate.json" <<'JSON'
{"mounts":[{"Name":"woodright-stack-3dsdhd_woodright_staging_media","Destination":"/server/static","RW":true}],"file_count":1000,"byte_size":5000000,"has_jpeg":false,"has_webp":true}
JSON
cat >"$FX/ps404/gate.json" <<'JSON'
{"mounts":[{"Name":"woodright-stack-3dsdhd_woodright_staging_media","Destination":"/server/static","RW":true}],"file_count":1000,"byte_size":5000000,"has_jpeg":true,"has_webp":true,"product_static_status":404}
JSON

"$GATE" --fixture-dir "$FX/pass" >/dev/null && pass "fixture pass" || fail "fixture pass"
"$GATE" --fixture-dir "$FX/empty" >/dev/null && fail "empty should fail" || pass "fixture empty fails"
"$GATE" --fixture-dir "$FX/wrong-vol" >/dev/null && fail "wrong-vol should fail" || pass "fixture wrong-vol fails"
"$GATE" --fixture-dir "$FX/ro-mount" >/dev/null && fail "ro should fail" || pass "fixture ro fails"
"$GATE" --fixture-dir "$FX/no-mount" >/dev/null && fail "no-mount should fail" || pass "fixture no-mount fails"
"$GATE" --fixture-dir "$FX/no-jpeg" >/dev/null && fail "no-jpeg should fail" || pass "fixture no-jpeg fails"
"$GATE" --fixture-dir "$FX/ps404" >/dev/null && fail "ps404 should fail" || pass "fixture ps404 fails"

# Name exclusion helper
# shellcheck source=../../ops/lib/woodright-runtime-discovery.sh
source "$DISC"
wr_name_is_excluded "woodright-staging-backend-rollback-20260723T215024Z" && pass "exclude rollback" || fail "exclude rollback"
wr_name_is_excluded "woodright-candidate-be-a11yp2" && pass "exclude candidate" || fail "exclude candidate"
wr_name_is_excluded "woodright-staging-backend" && fail "live should not exclude" || pass "live name allowed"

# Backup scripts must call discovery
grep -q 'wr_discover_backend_container' "$ROOT/ops/backup/woodright-media-backup.sh" && pass "media uses discovery" || fail "media discovery"
grep -q 'wr_discover_backend_container' "$ROOT/ops/backup/woodright-backup-run.sh" && pass "run uses discovery" || fail "run discovery"
grep -q 'wr_discover_storefront_container' "$ROOT/ops/backup/woodright-backup-run.sh" && pass "run SF discovery" || fail "run SF discovery"

# Monitoring remains free of mutate verbs (reuse existing scan lightly)
if grep -REn 'docker[[:space:]]+(restart|kill|rm)|compose[[:space:]]+(up|down)' "$ROOT/ops/monitoring" \
  | grep -vE '^\s*#|Forbidden|must never|Read-only|NEVER|inspect'; then
  fail "monitor mutation"
else
  pass "monitor mutation scan"
fi


# Docs present
[[ -f "$ROOT/docs/operator/backend-media-promotion-gate.md" ]] && pass "docs gate" || fail "docs gate"

# --- Portable mock validation (bash3-safe; no live Docker) ---
# shellcheck source=../../ops/lib/woodright-runtime-discovery.sh
source "$DISC"

SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
DIG=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
MOCK_NAME=""
MOCK_EXISTS=0
MOCK_RUNNING=0
MOCK_HEALTH=healthy
MOCK_OWNER=Dokploy
MOCK_ROLE=public_demo
MOCK_REV=$SHA
MOCK_TITLE=woodright-backend
MOCK_IMAGE=$DIG
MOCK_MOUNT_NAME=woodright-stack-3dsdhd_woodright_staging_media
MOCK_MOUNT_RW=true
MOCK_EXPECTED_BE=$DIG
MOCK_EXPECTED_SF=$DIG
MOCK_EXPECTED_SHA=$SHA

wr_container_exists() { [[ "$1" == "$MOCK_NAME" && "$MOCK_EXISTS" == "1" ]]; }
wr_container_running() { [[ "$1" == "$MOCK_NAME" && "$MOCK_RUNNING" == "1" ]]; }
wr_container_health_ok() { [[ "$MOCK_HEALTH" == "healthy" ]]; }
wr_container_label() {
  case "$2" in
    com.woodright.deployment-owner) echo "$MOCK_OWNER" ;;
    com.woodright.runtime-role) echo "$MOCK_ROLE" ;;
    org.opencontainers.image.revision) echo "$MOCK_REV" ;;
    org.opencontainers.image.title) echo "$MOCK_TITLE" ;;
    *) echo "" ;;
  esac
}
wr_container_image_id() { echo "$MOCK_IMAGE"; }
wr_container_mount_name_at() { echo "$MOCK_MOUNT_NAME"; }
wr_container_mount_rw_at() { echo "$MOCK_MOUNT_RW"; }
wr_json_get() {
  case "$2" in
    backend_digest) echo "$MOCK_EXPECTED_BE" ;;
    storefront_digest) echo "$MOCK_EXPECTED_SF" ;;
    approved_git_sha) echo "$MOCK_EXPECTED_SHA" ;;
    *) echo "" ;;
  esac
}

seed_good() {
  MOCK_NAME="$1"
  MOCK_EXISTS=1; MOCK_RUNNING=1; MOCK_HEALTH=healthy
  MOCK_OWNER=Dokploy; MOCK_ROLE=public_demo; MOCK_REV=$SHA
  MOCK_TITLE=woodright-backend; MOCK_IMAGE=$DIG
  MOCK_MOUNT_NAME=woodright-stack-3dsdhd_woodright_staging_media
  MOCK_MOUNT_RW=true
  MOCK_EXPECTED_BE=$DIG; MOCK_EXPECTED_SHA=$SHA
  WOODRIGHT_EXPECTED_RELEASE=/tmp/wr-mock-expected.json
  printf '{"backend_digest":"%s","storefront_digest":"%s","approved_git_sha":"%s"}\n' "$DIG" "$DIG" "$SHA" >"$WOODRIGHT_EXPECTED_RELEASE"
  WOODRIGHT_REQUIRE_EXPECTED_DIGEST=1
  WOODRIGHT_REQUIRE_MEDIA_MOUNT=1
  WOODRIGHT_REQUIRE_PUBLIC_DEMO=1
  WOODRIGHT_MEDIA_VOLUME=woodright-stack-3dsdhd_woodright_staging_media
  WOODRIGHT_MEDIA_MOUNT_IN_BE=/server/static
}

seed_good woodright-staging-backend
wr_validate_backend_candidate woodright-staging-backend && pass "mock valid backend" || fail "mock valid backend"

seed_good woodright-staging-backend-rollback-x
wr_validate_backend_candidate woodright-staging-backend-rollback-x && fail "rollback should fail" || pass "mock rollback excluded"

seed_good woodright-staging-backend
MOCK_MOUNT_NAME=""
wr_validate_backend_candidate woodright-staging-backend && fail "empty mount should fail" || {
  [[ "$WR_DISCOVERY_VERDICT" == MEDIA_MOUNT_MISSING ]] && pass "mock Mounts=[]" || fail "verdict=$WR_DISCOVERY_VERDICT"
}

seed_good woodright-staging-backend
MOCK_MOUNT_NAME=woodright-staging_woodright_staging_media
wr_validate_backend_candidate woodright-staging-backend && fail "wrong vol should fail" || pass "mock wrong volume"

seed_good woodright-staging-backend
MOCK_MOUNT_RW=false
wr_validate_backend_candidate woodright-staging-backend && fail "ro should fail" || pass "mock RO mount"

seed_good woodright-staging-backend
MOCK_IMAGE=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
wr_validate_backend_candidate woodright-staging-backend && fail "digest mismatch should fail" || pass "mock digest mismatch"

seed_good woodright-staging-backend
MOCK_OWNER=Nightly
wr_validate_backend_candidate woodright-staging-backend && fail "owner mismatch should fail" || pass "mock owner mismatch"

seed_good woodright-staging-backend
MOCK_REV=""
wr_validate_backend_candidate woodright-staging-backend && fail "empty oci rev should fail" || pass "mock empty oci rev"

seed_good woodright-staging-backend
WOODRIGHT_BE_CONTAINER=woodright-staging-backend
wr_discover_backend_container >/dev/null && [[ "$WR_BE_CONTAINER" == woodright-staging-backend ]] && pass "mock explicit override" || fail "mock explicit override"
unset WOODRIGHT_BE_CONTAINER

seed_good woodright-staging-backend
MOCK_EXPECTED_BE=""
MOCK_EXPECTED_SHA=""
printf '{}\n' >"$WOODRIGHT_EXPECTED_RELEASE"
wr_validate_backend_candidate woodright-staging-backend && fail "empty expected should fail" || pass "mock empty expected manifest"

node "$ROOT/scripts/release/backend-media-promotion.fidelity.test.cjs" && pass "cjs promotion fidelity" || fail "cjs promotion fidelity"

if [[ "$FAIL" -gt 0 ]]; then
  echo "FIDELITY_FAIL count=$FAIL"
  exit 1
fi
echo "FIDELITY_OK"
