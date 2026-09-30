#!/usr/bin/env bash
# Monitor identity: approved split predecessor is healthy; unexpected split is not.
# Does not touch Docker or the demo host.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

# shellcheck source=../../ops/lib/woodright-runtime-discovery.sh
source "$ROOT/ops/lib/woodright-runtime-discovery.sh"

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

BE='f9ea8f8fb7137dcd378fa38b578e3dada02c5992'
SF='023c9862f5e22d3a0d9dc536a38fc088002eb754'
UNIFIED='cf274909f194e3284450b27e73572092bed46304'
BAD='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
BE_DIG='sha256:67ef1ac5189f44465be149fa836066f4652b4437c9a1bada3ffdfc393a5c9e94'
SF_DIG='sha256:a37c5d06a7b9f4bc706cdbf4d60d57c451a6a28a3d6e0757c4c0b0784e153207'
NEW_BE='sha256:99a8e587a31596555c904d19f612478b8cdadb0b1a6b12a3cc2c86abd15d75f6'
NEW_SF='sha256:b322c5ce758d7d8e8c89302d9f0c33aed5ad9fc583e318dc1c7e31cf9c6e1fff'

write_doc() {
  local path="$1"
  shift
  python3 - "$path" "$@" <<'PY'
import json, sys
path = sys.argv[1]
doc = {}
args = sys.argv[2:]
for i in range(0, len(args), 2):
    doc[args[i]] = args[i + 1]
open(path, "w").write(json.dumps(doc))
PY
}

resolve_pair() {
  local f="$1"
  wr_resolve_expected_component_source_sha "$f" backend || return 1
  local be="$WR_EXPECTED_COMPONENT_SOURCE_SHA"
  wr_resolve_expected_component_source_sha "$f" storefront || return 1
  local sf="$WR_EXPECTED_COMPONENT_SOURCE_SHA"
  printf '%s %s\n' "$be" "$sf"
}

# A. Unified release resolves both components to the same SHA.
UNI="$TMP/unified.json"
write_doc "$UNI" \
  application_source_sha "$UNIFIED" \
  backend_digest "$NEW_BE" \
  storefront_digest "$NEW_SF" \
  backend_source_sha "$UNIFIED" \
  storefront_source_sha "$UNIFIED"
got="$(resolve_pair "$UNI")"
[[ "$got" == "$UNIFIED $UNIFIED" ]] && pass "A unified" || fail "A unified got=$got"

# B. Exact approved split.
SPLIT="$TMP/split.json"
write_doc "$SPLIT" \
  application_source_sha "$SF" \
  release_sha "$SF" \
  approved_git_sha "$SF" \
  backend_digest "$BE_DIG" \
  storefront_digest "$SF_DIG" \
  backend_source_sha "$BE" \
  storefront_source_sha "$SF"
got="$(resolve_pair "$SPLIT")"
[[ "$got" == "$BE $SF" ]] && pass "B approved split" || fail "B split got=$got"

# Buyer header expectation follows storefront_source_sha, not the backend SHA.
buyer="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("storefront_source_sha") or d.get("release_sha") or "")' "$SPLIT")"
[[ "$buyer" == "$SF" && "$buyer" != "$BE" ]] && pass "B buyer header uses storefront sha" || fail "B buyer=$buyer"

# C. Unexpected backend SHA is not the approved split.
BADBE="$TMP/bad-be.json"
write_doc "$BADBE" \
  backend_digest "$BE_DIG" \
  storefront_digest "$SF_DIG" \
  backend_source_sha "$BAD" \
  storefront_source_sha "$SF"
got="$(resolve_pair "$BADBE")"
[[ "$got" != "$BE $SF" ]] && pass "C unexpected backend sha rejected" || fail "C accepted bad backend"

# D. Unexpected storefront SHA.
BADSF="$TMP/bad-sf.json"
write_doc "$BADSF" \
  backend_digest "$BE_DIG" \
  storefront_digest "$SF_DIG" \
  backend_source_sha "$BE" \
  storefront_source_sha "$BAD"
got="$(resolve_pair "$BADSF")"
[[ "$got" != "$BE $SF" ]] && pass "D unexpected storefront sha rejected" || fail "D accepted bad storefront"

# E/F. Missing or malformed digest fails closed.
BADDIG="$TMP/bad-dig.json"
write_doc "$BADDIG" \
  backend_digest "not-a-digest" \
  storefront_digest "$SF_DIG" \
  backend_source_sha "$BE" \
  storefront_source_sha "$SF"
if wr_expected_component_digest "$BADDIG" backend; then
  fail "E bad backend digest accepted"
else
  pass "E wrong backend digest fail-closed"
fi
if wr_expected_component_digest "$BADDIG" storefront; then
  pass "F storefront digest still valid on that file"
else
  fail "F storefront digest unexpectedly failed"
fi

# G/H/I. Profile names are the live demo datastores and not production.
DEMO_CONF="$ROOT/ops/config/runtime-environments/public_demo.conf"
PROD_CONF="$ROOT/ops/config/runtime-environments/public_production.conf"
DEMO_PG="$(awk -F= '/^WOODRIGHT_PG_CONTAINER_PREFIX=/{print $2; exit}' "$DEMO_CONF")"
DEMO_REDIS="$(awk -F= '/^WOODRIGHT_REDIS_CONTAINER_DEFAULT=/{print $2; exit}' "$DEMO_CONF")"
PROD_PG="$(awk -F= '/^WOODRIGHT_PG_CONTAINER_PREFIX=/{print $2; exit}' "$PROD_CONF")"
PROD_REDIS="$(awk -F= '/^WOODRIGHT_REDIS_CONTAINER_DEFAULT=/{print $2; exit}' "$PROD_CONF")"
[[ "$DEMO_PG" == "woodright-staging-postgres" ]] && pass "G demo postgres name" || fail "G pg=$DEMO_PG"
[[ "$DEMO_REDIS" == "woodright-staging-redis" ]] && pass "H demo redis name" || fail "H redis=$DEMO_REDIS"
[[ "$DEMO_PG" != "$PROD_PG" && "$DEMO_REDIS" != "$PROD_REDIS" ]] \
  && pass "I demo datastores are not production" || fail "I isolation pg=$DEMO_PG redis=$DEMO_REDIS prod_pg=$PROD_PG"

# J. Missing expected file fails closed.
if wr_resolve_expected_component_source_sha "$TMP/missing.json" backend; then
  fail "J missing file accepted"
else
  pass "J missing expected release fail-closed"
fi

# K. Pair rewrite converges a split file onto one SHA.
# Inline the same field write the pin reconciler performs.
python3 - "$SPLIT" "$UNIFIED" "$NEW_BE" "$NEW_SF" <<'PY'
import json, sys
path, sha, be_d, sf_d = sys.argv[1:5]
doc = json.load(open(path))
doc["application_source_sha"] = sha
doc["release_sha"] = sha
doc["git_sha"] = sha
doc["approved_git_sha"] = sha
doc["backend_digest"] = be_d
doc["storefront_digest"] = sf_d
doc["backend_source_sha"] = sha
doc["storefront_source_sha"] = sha
json.dump(doc, open(path, "w"))
PY
got="$(resolve_pair "$SPLIT")"
[[ "$got" == "$UNIFIED $UNIFIED" ]] && pass "K post-cutover unified" || fail "K got=$got"

# Health-check buyer comparison prefers storefront_source_sha.
grep -q 'storefront_source_sha' "$ROOT/ops/monitoring/woodright-health-check.sh" \
  && pass "buyer check reads storefront_source_sha" || fail "buyer check missing storefront_source_sha"

# Unified pin rewrite records both component SHAs from EXPECTED_RELEASE_SHA only.
grep -q 'doc\["backend_source_sha"\] = sha' "$ROOT/scripts/release/reconcile-public-image-pins.sh" \
  && pass "pin reconcile writes backend_source_sha from unified sha" || fail "pin reconcile missing unified backend_source_sha"
grep -q 'release_identity"\] = "unified"' "$ROOT/scripts/release/reconcile-public-image-pins.sh" \
  && pass "unified rewrite marks release_identity" || fail "unified rewrite missing release_identity"
grep -q 'component shas not converged' "$ROOT/scripts/release/reconcile-public-image-pins.sh" \
  && pass "pin reconcile validates component shas" || fail "pin reconcile missing component sha validation"
grep -q "trap 'release_lock_holder' EXIT" "$ROOT/scripts/release/reconcile-public-image-pins.sh" \
  && pass "split writer releases the lock holder" || fail "split writer missing lock-holder trap"

# Explicit split writer: does not stamp one SHA, refuses pin updates, fixture only.
PIN="$ROOT/scripts/release/reconcile-public-image-pins.sh"
SPLIT_DOC="$TMP/host-expected.json"
SPLIT_LOCK="$TMP/live-cutover.lock"
: >"$SPLIT_LOCK"
printf '%s\n' '{"application_source_sha":"24f7dc9a73a48836df21762ea28b3ee8b8e54f48","release_sha":"24f7dc9a73a48836df21762ea28b3ee8b8e54f48","backend_digest":"sha256:5a491106748ee42cc5a399a15003d537c241069ddc3678dc7f9b3e92672c80fe","storefront_digest":"sha256:ab1b258288dd035a11400a33d3d15dfa6a95135566491f323574d305d5da1212"}' >"$SPLIT_DOC"
if WRITE_SPLIT_EXPECTED_RELEASE=1 UPDATE_PINS=0 UPDATE_ACTIVE_PUBLIC=0 UPDATE_ACTIVE_RELEASE=0 UPDATE_SCOPED_OWNERSHIP=0 \
  APPLY=1 WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1 \
  WOODRIGHT_CUTOVER_LOCK_PATH="$SPLIT_LOCK" \
  EXPECTED_RELEASE_FILE="$SPLIT_DOC" \
  EXPECTED_BACKEND_SOURCE_SHA="$BE" EXPECTED_STOREFRONT_SOURCE_SHA="$SF" \
  EXPECTED_BACKEND_DIGEST="$BE_DIG" EXPECTED_STOREFRONT_DIGEST="$SF_DIG" \
  bash "$PIN" --environment public_demo --component pair >"$TMP/split-write.out" 2>&1; then
  pass "split writer apply"
else
  fail "split writer apply"
  cat "$TMP/split-write.out" || true
fi
python3 - "$SPLIT_DOC" "$BE" "$SF" "$BE_DIG" "$SF_DIG" <<'PY' || fail "split writer document"
import json, sys
from pathlib import Path
doc = json.loads(Path(sys.argv[1]).read_text())
be, sf, be_d, sf_d = sys.argv[2:6]
assert doc["release_identity"] == "split", doc.get("release_identity")
assert doc["backend_source_sha"] == be and doc["storefront_source_sha"] == sf
assert doc["backend_digest"] == be_d and doc["storefront_digest"] == sf_d
for key in ("application_source_sha", "release_sha", "git_sha", "approved_git_sha"):
    assert not doc.get(key), key
assert doc["previous_application_source_sha"].startswith("24f7dc9")
print("ok")
PY
pass "split writer drops unified sha"
OWNER_DOC="$TMP/ACTIVE_OWNER.json"
cp "$SPLIT_DOC" "$OWNER_DOC"
if WRITE_SPLIT_EXPECTED_RELEASE=1 UPDATE_PINS=0 UPDATE_ACTIVE_PUBLIC=0 UPDATE_ACTIVE_RELEASE=0 UPDATE_SCOPED_OWNERSHIP=0 \
  APPLY=1 WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1 \
  WOODRIGHT_CUTOVER_LOCK_PATH="$SPLIT_LOCK" \
  EXPECTED_RELEASE_FILE="$OWNER_DOC" \
  EXPECTED_BACKEND_SOURCE_SHA="$BE" EXPECTED_STOREFRONT_SOURCE_SHA="$SF" \
  EXPECTED_BACKEND_DIGEST="$BE_DIG" EXPECTED_STOREFRONT_DIGEST="$SF_DIG" \
  bash "$PIN" --environment public_demo --component pair >"$TMP/split-owner.out" 2>&1; then
  fail "split writer accepted ACTIVE_OWNER path"
else
  pass "split writer refuses ACTIVE_OWNER path"
fi
if WRITE_SPLIT_EXPECTED_RELEASE=1 UPDATE_PINS=1 UPDATE_ACTIVE_PUBLIC=0 UPDATE_ACTIVE_RELEASE=0 UPDATE_SCOPED_OWNERSHIP=0 \
  APPLY=0 WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1 \
  WOODRIGHT_CUTOVER_LOCK_PATH="$SPLIT_LOCK" \
  EXPECTED_RELEASE_FILE="$SPLIT_DOC" \
  EXPECTED_BACKEND_SOURCE_SHA="$BE" EXPECTED_STOREFRONT_SOURCE_SHA="$SF" \
  EXPECTED_BACKEND_DIGEST="$BE_DIG" EXPECTED_STOREFRONT_DIGEST="$SF_DIG" \
  bash "$PIN" --environment public_demo --component pair >"$TMP/split-pins.out" 2>&1; then
  fail "split writer accepted pin update"
else
  pass "split writer refuses pin update"
fi

# Cutover backup must pass the profile postgres name through sudo and refuse production.
CUTOVER="$ROOT/ops/release/cutover-public-demo-pair.sh"
grep -q 'WOODRIGHT_PG_CONTAINER="$pg"' "$CUTOVER" \
  && pass "cutover passes profile postgres to backup" || fail "cutover backup missing profile postgres pin"
grep -q 'refusing production postgres' "$CUTOVER" \
  && pass "cutover refuses production postgres" || fail "cutover missing production postgres refusal"

# Registry manifest digest matches via RepoDigests. A different digest does not.
SHIM="$(mktemp -d)"
cat >"$SHIM/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "inspect" && "${2:-}" == "-f" ]]; then
  printf '%s\n' "sha256:454b7c84f1d69d46c532c3b981575cec7039c5d0f640c8ed71ea9fbd9ce86890"
  exit 0
fi
if [[ "${1:-}" == "image" && "${2:-}" == "inspect" ]]; then
  if [[ "${3:-}" == sha256:454b7c84f1d69d46c532c3b981575cec7039c5d0f640c8ed71ea9fbd9ce86890 ]]; then
    printf '%s\n' "ghcr.io/saintgroovie/woodright-backend@sha256:67ef1ac5189f44465be149fa836066f4652b4437c9a1bada3ffdfc393a5c9e94"
    exit 0
  fi
  exit 1
fi
exit 1
EOF
chmod +x "$SHIM/docker"
if PATH="$SHIM:$PATH" wr_container_image_matches_expected_digest \
  woodright-staging-backend \
  "sha256:67ef1ac5189f44465be149fa836066f4652b4437c9a1bada3ffdfc393a5c9e94"; then
  pass "registry digest matches RepoDigests"
else
  fail "registry digest did not match RepoDigests"
fi
if PATH="$SHIM:$PATH" wr_container_image_matches_expected_digest \
  woodright-staging-backend \
  "sha256:0000000000000000000000000000000000000000000000000000000000000000"; then
  fail "wrong registry digest was accepted"
else
  pass "wrong registry digest rejected"
fi
rm -rf "$SHIM"

[[ "$FAIL" -eq 0 ]] || exit 1
echo "public-demo-monitor-split-identity: ok"
