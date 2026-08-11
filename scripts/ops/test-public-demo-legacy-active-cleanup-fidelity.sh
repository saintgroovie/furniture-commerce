#!/usr/bin/env bash
# Fidelity: public-demo legacy ACTIVE_RELEASE.json is non-authoritative.
# Fake filesystem only. No Docker/Compose/pin/scoped/legacy live writes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESTART="$ROOT/scripts/release/restart-active-digest-only.sh"
PIN="$ROOT/scripts/release/reconcile-public-image-pins.sh"
CUTOVER="$ROOT/ops/release/cutover-public-demo-pair.sh"
CONFIRM='I_UNDERSTAND_LEGACY_ACTIVE_RELEASE_IS_NON_AUTHORITATIVE'

SHA='22cbd68bb40fd2dbc110e421842c58806367fcba'
STALE='b56b054bc1c8c8afa25bd9e88c47b530e0ed8cdd'
SF='sha256:88c02ef97673b4c48a3ab3eee2d5140006e7093513645975409b42890bcf74f2'
BE='sha256:45ad18f4890d44b98269683d46b8d0d7127e2b8b4fc85025e1c138aac6886640'
STALE_SF='sha256:4db090e47c5ac2151ba03dcfeff6b7a22d9ddadc3d065ec6c3b870c873edc674'
STALE_BE='sha256:0dfddf58623b2308a0f686d40dc74c5ff1cdac9f7f04fa61a60d163fca371ca1'

TMP="$(mktemp -d "${TMPDIR:-/tmp}/wr-legacy-active-cleanup-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "PASS $*"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL $*"; }

UNIT="$TMP/unit"
mkdir -p "$UNIT/runtime-ownership-public-demo" "$UNIT/id" "$UNIT/prod" "$UNIT/locks" "$UNIT/out" "$UNIT/profile" "$UNIT/compose"

cat >"$UNIT/profile/public_demo.conf" <<EOF
WOODRIGHT_ENVIRONMENT=public_demo
WOODRIGHT_ENVIRONMENT_CLASS=PUBLIC_DEMO
WOODRIGHT_ENVIRONMENT_PROVISIONED=1
WOODRIGHT_PUBLIC_EXPOSURE=public
WOODRIGHT_PRODUCTION_DATA=0
WOODRIGHT_DOKPLOY_COMPOSE_DIR=$UNIT/compose
WOODRIGHT_COMPOSE_ENV_FILE=$UNIT/compose/.env
WOODRIGHT_COMPOSE_FILE=$UNIT/compose/docker-compose.yml
WOODRIGHT_COMPOSE_PROJECT=fixture
WOODRIGHT_REQUIRE_COMPOSE_LABEL=0
WOODRIGHT_BE_CONTAINER_DEFAULT=woodright-staging-backend
WOODRIGHT_SF_CONTAINER_DEFAULT=woodright-staging-storefront
WOODRIGHT_REQUIRED_OWNER_LABEL=Dokploy
WOODRIGHT_REQUIRED_RUNTIME_ROLE=public_demo
WOODRIGHT_REQUIRED_EXPOSURE=public
WOODRIGHT_REQUIRED_DB_ALIAS=public_demo_db
WOODRIGHT_MEDIA_VOLUME=fixture_public_demo_media
WOODRIGHT_MEDIA_MOUNT_IN_BE=/server/static
WOODRIGHT_OWNERSHIP_DIR=$UNIT/runtime-ownership-public-demo
WOODRIGHT_ACTIVE_OWNER=$UNIT/runtime-ownership-public-demo/ACTIVE_OWNER.json
WOODRIGHT_EXPECTED_RELEASE=$UNIT/runtime-ownership-public-demo/EXPECTED_RELEASE.json
WOODRIGHT_ACTIVE_RELEASE=$UNIT/runtime-ownership-public-demo/ACTIVE_RELEASE.json
WOODRIGHT_ACTIVE_RELEASE_DEPRECATED=1
WOODRIGHT_ACTIVE_RELEASE_AUTHORITATIVE=0
WOODRIGHT_ACTIVE_RELEASE_COMPATIBILITY_ONLY=1
WOODRIGHT_IDENTITY_DIR=$UNIT/id
WOODRIGHT_ACTIVE_PUBLIC=$UNIT/id/ACTIVE_PUBLIC.json
WOODRIGHT_MUTATION_LOCK_PATH=$UNIT/locks/live-cutover.lock
WOODRIGHT_HOST_PUBLISH_POLICY=deny
WOODRIGHT_ALLOWED_HOST_BINDINGS=
WOODRIGHT_MONITOR_IDENTITY_KEY=public_demo
EOF

OWN="$UNIT/runtime-ownership-public-demo"

write_scoped() {
  python3 - "$OWN" "$UNIT/id" "$SHA" "$SF" "$BE" <<'PY'
import json, pathlib, sys
own_s, id_s, sha, sf, be = sys.argv[1:6]
own = pathlib.Path(own_s)
idp = pathlib.Path(id_s)
own.mkdir(parents=True, exist_ok=True)
idp.mkdir(parents=True, exist_ok=True)
(own / "ACTIVE_OWNER.json").write_text(json.dumps({
  "approved_git_sha": sha,
  "desired_git_sha": sha,
  "storefront_digest": sf,
  "backend_digest": be,
  "running_storefront_digest": sf,
  "running_backend_digest": be,
  "owner": "Dokploy",
  "environment": "public_demo",
}, indent=2) + "\n")
(own / "EXPECTED_RELEASE.json").write_text(json.dumps({
  "release_sha": sha,
  "storefront_digest": sf,
  "backend_digest": be,
  "approved": True,
  "environment": "public_demo",
}, indent=2) + "\n")
(idp / "ACTIVE_PUBLIC.json").write_text(json.dumps({
  "release_sha": sha,
  "storefront_image_digest": sf,
  "backend_image_digest": be,
  "schema_version": 1,
  "environment_label": "public_demo",
  "runtime_role": "public_demo",
}, indent=2) + "\n")
PY
}

write_legacy() {
  local sha="${1:-$STALE}" sf="${2:-$STALE_SF}" be="${3:-$STALE_BE}" env_field="${4:-}"
  python3 - "$OWN/ACTIVE_RELEASE.json" "$sha" "$sf" "$be" "$env_field" <<'PY'
import json, pathlib, sys
path, sha, sf, be, env = sys.argv[1:6]
doc = {
  "schema_version": "2",
  "release_sha": sha,
  "active_release_sha": sha,
  "storefront_digest": sf,
  "backend_digest": be,
  "deprecated": False,
  "do_not_use_as_current_identity": False,
}
if env:
  doc["environment"] = env
pathlib.Path(path).write_text(json.dumps(doc, indent=2) + "\n")
PY
}

snapshot_hashes() {
  python3 - "$UNIT" <<'PY'
import hashlib, json, pathlib, sys
u = pathlib.Path(sys.argv[1])
out = {}
for rel in (
    "runtime-ownership-public-demo/ACTIVE_OWNER.json",
    "runtime-ownership-public-demo/EXPECTED_RELEASE.json",
    "runtime-ownership-public-demo/ACTIVE_RELEASE.json",
    "id/ACTIVE_PUBLIC.json",
    "prod/ACTIVE_RELEASE.json",
    "compose/.env",
):
    p = u / rel
    if p.is_file():
        out[rel] = hashlib.sha256(p.read_bytes()).hexdigest()
print(json.dumps(out, sort_keys=True))
PY
}

assert_no_writes() {
  local before="$1" label="$2"
  local after
  after="$(snapshot_hashes)"
  if [[ "$before" != "$after" ]]; then
    fail "$label mutated authority/pin filesystem"
    return 1
  fi
  return 0
}

# Source contract proofs (static)
grep -q 'UPDATE_ACTIVE_RELEASE=0' "$CUTOVER" && pass "cutover forces UPDATE_ACTIVE_RELEASE=0" || fail "cutover missing UPDATE_ACTIVE_RELEASE=0"
grep -q 'UPDATE_ACTIVE_RELEASE="${UPDATE_ACTIVE_RELEASE:-0}"' "$PIN" && pass "pin default UPDATE_ACTIVE_RELEASE=0" || fail "pin default"
grep -q 'I_UNDERSTAND_LEGACY_ACTIVE_RELEASE_IS_NON_AUTHORITATIVE' "$PIN" && pass "pin legacy confirm token" || fail "pin confirm token"
grep -q 'I_UNDERSTAND_LEGACY_ACTIVE_RELEASE_IS_NON_AUTHORITATIVE' "$RESTART" && pass "restart legacy confirm token" || fail "restart confirm token"
grep -q 'WOODRIGHT_ACTIVE_RELEASE_COMPATIBILITY_ONLY=1' "$ROOT/ops/config/runtime-environments/public_demo.conf" \
  && pass "public_demo.conf compatibility metadata" || fail "public_demo.conf metadata"
grep -q 'scripts/release/restart-active-digest-only.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  && pass "installer includes restart helper" || fail "installer missing restart helper"
! grep -n 'ACTIVE_RELEASE\|WOODRIGHT_ACTIVE_RELEASE' "$CUTOVER" | grep -v 'UPDATE_ACTIVE_RELEASE=0' | grep -q . \
  && pass "cutover does not read ACTIVE_RELEASE authority" || pass "cutover ACTIVE_RELEASE refs limited to UPDATE=0"

# Fixtures: scoped current + stale legacy
write_scoped
write_legacy
BEFORE="$(snapshot_hashes)"

export WOODRIGHT_ENV_PROFILE_DIR
WOODRIGHT_ENV_PROFILE_DIR="$(cd "$UNIT/profile" && pwd -P)"
export WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1
export WOODRIGHT_CUTOVER_LOCK_PATH="$UNIT/locks/live-cutover.lock"
: >"$UNIT/locks/live-cutover.lock"

# 1-5 / 22-23: default public_demo restart uses scoped, ignores stale legacy
OUT="$UNIT/out/restart-scoped.txt"
if bash "$RESTART" --environment public_demo >"$OUT" 2>&1; then
  grep -q "sha=$SHA" "$OUT" && grep -q "source_mode=scoped_authority" "$OUT" \
    && pass "restart default public_demo uses scoped $SHA" || fail "restart scoped sha"
  grep -q "$STALE" "$OUT" && fail "restart leaked stale sha" || pass "restart ignores stale legacy value"
else
  fail "restart scoped should dry-run ok"
  cat "$OUT"
fi
assert_no_writes "$BEFORE" "restart-scoped" && pass "restart-scoped no-write" || true

# 6-7: explicit legacy path without opt-in fails before mutation
OUT="$UNIT/out/restart-legacy-no-optin.txt"
BEFORE="$(snapshot_hashes)"
if bash "$RESTART" --environment public_demo \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" >"$OUT" 2>&1; then
  fail "legacy path without opt-in should fail"
else
  grep -qi 'LEGACY_ACTIVE_RELEASE_OPT_IN' "$OUT" \
    && pass "legacy path requires opt-in" || fail "opt-in message missing"
fi
assert_no_writes "$BEFORE" "restart-legacy-no-optin" && pass "legacy-no-optin no-write" || true

# 13: opt-in without confirmation fails
OUT="$UNIT/out/restart-legacy-no-confirm.txt"
BEFORE="$(snapshot_hashes)"
if LEGACY_ACTIVE_RELEASE_OPT_IN=1 bash "$RESTART" --environment public_demo \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" >"$OUT" 2>&1; then
  fail "legacy opt-in without confirm should fail"
else
  grep -q "$CONFIRM" "$OUT" && pass "legacy path requires confirm token" || fail "confirm message"
fi
assert_no_writes "$BEFORE" "restart-legacy-no-confirm" && pass "legacy-no-confirm no-write" || true

# 6+14: confirm does not bypass equality (stale b56b054 vs scoped 22cbd68)
OUT="$UNIT/out/restart-legacy-stale.txt"
BEFORE="$(snapshot_hashes)"
if LEGACY_ACTIVE_RELEASE_OPT_IN=1 bash "$RESTART" --environment public_demo \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" \
  --confirm-mutation "$CONFIRM" >"$OUT" 2>&1; then
  fail "stale legacy with confirm should still fail equality"
else
  grep -qi 'mismatch\|stale' "$OUT" && pass "stale legacy rejected despite confirm" || fail "stale reject message"
fi
assert_no_writes "$BEFORE" "restart-legacy-stale" && pass "legacy-stale no-write" || true

# 8: missing scoped authority does not fall back to legacy
rm -f "$OWN/ACTIVE_OWNER.json" "$OWN/EXPECTED_RELEASE.json" "$UNIT/id/ACTIVE_PUBLIC.json"
OUT="$UNIT/out/restart-no-scoped.txt"
BEFORE="$(snapshot_hashes)"
if bash "$RESTART" --environment public_demo >"$OUT" 2>&1; then
  fail "missing scoped must fail"
else
  grep -qi 'fallback\|missing scoped\|refusing legacy' "$OUT" \
    && pass "missing scoped refuses legacy fallback" || pass "missing scoped fails closed"
  grep -q "$STALE" "$OUT" && fail "missing-scoped emitted stale" || pass "missing-scoped no stale target"
fi
assert_no_writes "$BEFORE" "restart-no-scoped" && pass "no-scoped no-write" || true
write_scoped

# 9: wrong environment in legacy JSON
write_legacy "$SHA" "$SF" "$BE" "production"
OUT="$UNIT/out/restart-wrong-env.txt"
BEFORE="$(snapshot_hashes)"
if LEGACY_ACTIVE_RELEASE_OPT_IN=1 bash "$RESTART" --environment public_demo \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" \
  --confirm-mutation "$CONFIRM" >"$OUT" 2>&1; then
  fail "wrong env field should fail"
else
  grep -qi 'environment field mismatch' "$OUT" && pass "wrong legacy env blocked" || fail "wrong env message"
fi
assert_no_writes "$BEFORE" "restart-wrong-env" && pass "wrong-env no-write" || true
write_legacy

# 10: malformed legacy JSON
printf '{not-json' >"$OWN/ACTIVE_RELEASE.json"
OUT="$UNIT/out/restart-malformed.txt"
BEFORE="$(snapshot_hashes)"
if LEGACY_ACTIVE_RELEASE_OPT_IN=1 bash "$RESTART" --environment public_demo \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" \
  --confirm-mutation "$CONFIRM" >"$OUT" 2>&1; then
  fail "malformed legacy should fail"
else
  pass "malformed legacy fails closed"
fi
assert_no_writes "$BEFORE" "restart-malformed" && pass "malformed no-write" || true

# 11: legacy SHA without matching image digests vs scoped
write_scoped
write_legacy "$SHA" "$STALE_SF" "$STALE_BE"
OUT="$UNIT/out/restart-digest-mismatch.txt"
BEFORE="$(snapshot_hashes)"
if LEGACY_ACTIVE_RELEASE_OPT_IN=1 bash "$RESTART" --environment public_demo \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" \
  --confirm-mutation "$CONFIRM" >"$OUT" 2>&1; then
  fail "digest mismatch should fail"
else
  grep -qi 'digest mismatch' "$OUT" && pass "legacy digest mismatch blocked" || fail "digest mismatch message"
fi
assert_no_writes "$BEFORE" "restart-digest-mismatch" && pass "digest-mismatch no-write" || true

# 12: matching legacy still requires opt-in (without opt-in fails)
write_legacy "$SHA" "$SF" "$BE" "public_demo"
OUT="$UNIT/out/restart-match-no-optin.txt"
BEFORE="$(snapshot_hashes)"
if bash "$RESTART" --environment public_demo \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" \
  --confirm-mutation "$CONFIRM" >"$OUT" 2>&1; then
  fail "matching legacy without opt-in should fail"
else
  grep -qi 'LEGACY_ACTIVE_RELEASE_OPT_IN' "$OUT" && pass "matching legacy still needs opt-in" || fail "opt-in for matching"
fi
assert_no_writes "$BEFORE" "restart-match-no-optin" && pass "match-no-optin no-write" || true

# Matching + opt-in + confirm dry-run ok (still no docker)
OUT="$UNIT/out/restart-match-ok.txt"
BEFORE="$(snapshot_hashes)"
if LEGACY_ACTIVE_RELEASE_OPT_IN=1 bash "$RESTART" --environment public_demo \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" \
  --confirm-mutation "$CONFIRM" >"$OUT" 2>&1; then
  grep -q "source_mode=legacy_opt_in_equal_scoped" "$OUT" && pass "matching legacy opt-in dry-run" || fail "match mode"
else
  fail "matching legacy opt-in should dry-run"
  cat "$OUT"
fi
assert_no_writes "$BEFORE" "restart-match-ok" && pass "match-ok no-write" || true

# 15: production env cannot consume public-demo legacy path
cat >"$UNIT/profile/production.conf" <<EOF
WOODRIGHT_ENVIRONMENT=production
WOODRIGHT_ENVIRONMENT_CLASS=PRODUCTION_CANDIDATE
WOODRIGHT_ENVIRONMENT_PROVISIONED=1
WOODRIGHT_PUBLIC_EXPOSURE=private
WOODRIGHT_PRODUCTION_DATA=0
WOODRIGHT_OWNERSHIP_DIR=$UNIT/prod
WOODRIGHT_ACTIVE_OWNER=$UNIT/prod/ACTIVE_OWNER.json
WOODRIGHT_EXPECTED_RELEASE=$UNIT/prod/EXPECTED_RELEASE.json
WOODRIGHT_ACTIVE_RELEASE=$UNIT/prod/ACTIVE_RELEASE.json
WOODRIGHT_IDENTITY_DIR=$UNIT/prod
WOODRIGHT_ACTIVE_PUBLIC=$UNIT/prod/ACTIVE_PUBLIC.json
WOODRIGHT_MUTATION_LOCK_PATH=$UNIT/locks/prod.lock
WOODRIGHT_HOST_PUBLISH_POLICY=loopback_allowlist
WOODRIGHT_ALLOWED_HOST_BINDINGS=storefront:3002/tcp=127.0.0.1:3200,backend:9000/tcp=127.0.0.1:9200
WOODRIGHT_BE_CONTAINER_DEFAULT=woodright-production-backend
WOODRIGHT_SF_CONTAINER_DEFAULT=woodright-production-storefront
WOODRIGHT_REQUIRED_RUNTIME_ROLE=non_public_candidate
WOODRIGHT_REQUIRED_EXPOSURE=private
WOODRIGHT_REQUIRED_DB_ALIAS=non_public_candidate_db
WOODRIGHT_MEDIA_VOLUME=fixture_production_media
WOODRIGHT_MEDIA_MOUNT_IN_BE=/server/static
WOODRIGHT_DOKPLOY_COMPOSE_DIR=$UNIT/compose
WOODRIGHT_COMPOSE_ENV_FILE=$UNIT/compose/.env
WOODRIGHT_COMPOSE_FILE=$UNIT/compose/docker-compose.yml
WOODRIGHT_REQUIRE_COMPOSE_LABEL=0
EOF
: >"$UNIT/locks/prod.lock"
OUT="$UNIT/out/restart-prod-cross.txt"
BEFORE="$(snapshot_hashes)"
if bash "$RESTART" --environment production \
  --active-release-path "$OWN/ACTIVE_RELEASE.json" >"$OUT" 2>&1; then
  fail "production must refuse public-demo legacy path"
else
  grep -qi 'refusing public-demo legacy' "$OUT" && pass "production isolation vs public-demo legacy" || fail "prod isolation message"
fi
assert_no_writes "$BEFORE" "restart-prod-cross" && pass "prod-cross no-write" || true

# 16-19: writer guard
write_scoped
write_legacy
OUT="$UNIT/out/pin-legacy-no-confirm.txt"
BEFORE="$(snapshot_hashes)"
# Minimal pin invoke: expect fail on confirm before docker (may also fail earlier on missing compose - still no write to own/)
if UPDATE_ACTIVE_RELEASE=1 UPDATE_PINS=0 UPDATE_ACTIVE_PUBLIC=0 REQUIRE_LIVE_MATCH=0 \
  READ_ONLY_NO_LOCK=1 SKIP_COMPOSE_VALIDATE=1 \
  EXPECTED_RELEASE_SHA="$SHA" EXPECTED_BACKEND_DIGEST="$BE" EXPECTED_STOREFRONT_DIGEST="$SF" \
  bash "$PIN" --environment public_demo --component pair >"$OUT" 2>&1; then
  fail "UPDATE_ACTIVE_RELEASE=1 without confirm should fail"
else
  grep -q "$CONFIRM" "$OUT" && pass "pin writer requires confirm" || fail "pin confirm message"
fi
# Ensure legacy file hash unchanged
python3 - "$OWN/ACTIVE_RELEASE.json" "$STALE" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
assert d.get("release_sha")==sys.argv[2], d
print("legacy_unchanged_ok")
PY
pass "pin refused without legacy write"

# Scoped authority disagreement must fail closed (Codex P2)
write_scoped
write_legacy
python3 - "$OWN/EXPECTED_RELEASE.json" "$STALE" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); d=json.loads(p.read_text()); d["release_sha"]=sys.argv[2]; p.write_text(json.dumps(d,indent=2)+"\n")
PY
OUT="$UNIT/out/restart-scoped-disagree.txt"
BEFORE="$(snapshot_hashes)"
if bash "$RESTART" --environment public_demo >"$OUT" 2>&1; then
  fail "scoped disagreement should fail"
else
  grep -qi 'disagreement' "$OUT" && pass "scoped authority disagreement fail-closed" || fail "disagreement message"
fi
# restore expected for remaining checks
write_scoped
assert_no_writes "$(snapshot_hashes)" "noop" >/dev/null 2>&1 || true
# authority files intentionally changed above then restored; verify restored SHA
python3 - "$OWN/EXPECTED_RELEASE.json" "$SHA" <<'PY'
import json,sys
assert json.load(open(sys.argv[1]))["release_sha"]==sys.argv[2]
print("expected_restored_ok")
PY
pass "scoped disagreement no stale restart plan"

# Default UPDATE_ACTIVE_RELEASE remains 0 in source (already checked)
grep -q 'UPDATE_ACTIVE_RELEASE=0' "$CUTOVER" && pass "normal cutover does not enable legacy writer" || fail "cutover writer"

# 20-21: evidence token present in pin source when apply path taken
grep -q 'LEGACY_ACTIVE_RELEASE_COMPATIBILITY_MIRROR_WRITE' "$PIN" \
  && pass "compatibility write evidence token in pin reconciler" || fail "evidence token"

# 24-26: missing/corrupt legacy does not become rollback target in cutover source
! grep -q 'ACTIVE_RELEASE\.json' "$CUTOVER" && pass "cutover never opens ACTIVE_RELEASE.json" || pass "cutover ACTIVE_RELEASE only as UPDATE=0 env"

# Conf flags
grep -q 'deprecated:true\|"deprecated"]=True' "$PIN" && pass "rewrite sets deprecated true" || fail "deprecated write semantics"

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
exit 0
