#!/usr/bin/env bash
# Fidelity: public_demo pair pin reconcile converges scoped OWNER/EXPECTED
# and compose WOODRIGHT_RELEASE_SHA. Fake FS only. No live VM mutation.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIN="$ROOT/scripts/release/reconcile-public-image-pins.sh"
CUTOVER="$ROOT/ops/release/cutover-public-demo-pair.sh"
REAL_CONF="$ROOT/ops/config/runtime-environments/public_demo.conf"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

TMP="$(mktemp -d /tmp/wr-pd-scoped-own-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

SHA='4533c5334b75eab8e353b69c14d894fed0d423ae'
STALE_SHA='c7ec4457b2cf0e5f68d42fb76decb8016dbb7c3a'
FILE_SHA='74fbad4b4247653278517ead3826548e3f44ed6b'
BE='sha256:53e0f6bbdef7094a46eb95c3d50269338055344af06ce7bc38b07a0a4b460ba6'
SF='sha256:544826a72d53f2510269bb5a36c6580ffac74307f395e0ff821f0d07934e4e36'
OLD_BE='sha256:1441be74538b50a79e6ecaa6d21f38562b781fac66bcd0a12ca1c04e524d79af'
OLD_SF='sha256:046d4fe6ad4024cdc37bb892ad5e564618b2283a15454d8b54433bee935caa78'

grep -q 'UPDATE_SCOPED_OWNERSHIP=1' "$CUTOVER" && pass "cutover enables scoped ownership converge" || fail "cutover missing UPDATE_SCOPED_OWNERSHIP=1"
grep -q 'UPDATE_ACTIVE_RELEASE=0' "$CUTOVER" && pass "cutover keeps legacy ACTIVE_RELEASE off" || fail "cutover ACTIVE_RELEASE"
grep -q 'UPDATE_SCOPED_OWNERSHIP="${UPDATE_SCOPED_OWNERSHIP:-0}"' "$PIN" && pass "pin default scoped ownership off" || fail "pin default"

# Component-only must refuse scoped ownership writes.
UNIT="$TMP/unit"
mkdir -p "$UNIT/own" "$UNIT/id" "$UNIT/compose" "$UNIT/locks" "$UNIT/meta/public_demo" "$UNIT/profiles"
printf '{"approved_git_sha":"%s"}\n' "$STALE_SHA" >"$UNIT/own/ACTIVE_OWNER.json"
printf '{"application_source_sha":"%s"}\n' "$STALE_SHA" >"$UNIT/own/EXPECTED_RELEASE.json"
printf 'WOODRIGHT_BACKEND_IMAGE=x\nWOODRIGHT_STOREFRONT_IMAGE=y\nWOODRIGHT_RELEASE_SHA=%s\n' "$FILE_SHA" >"$UNIT/compose/.env"
printf 'services: {}\n' >"$UNIT/compose/docker-compose.staging.yml"
touch "$UNIT/locks/live-cutover.lock"
sed -e "s#=/srv/#=${UNIT}/srv/#g" -e "s#=/etc/dokploy/#=${UNIT}/etc/dokploy/#g" "$REAL_CONF" >"$UNIT/profiles/public_demo.conf" || cp "$REAL_CONF" "$UNIT/profiles/public_demo.conf"

if UPDATE_SCOPED_OWNERSHIP=1 REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1 \
  WOODRIGHT_CUTOVER_LOCK_PATH="$UNIT/locks/live-cutover.lock" \
  WOODRIGHT_ACTIVE_OWNER="$UNIT/own/ACTIVE_OWNER.json" \
  WOODRIGHT_EXPECTED_RELEASE="$UNIT/own/EXPECTED_RELEASE.json" \
  ENV_FILE="$UNIT/compose/.env" COMPOSE_FILE="$UNIT/compose/docker-compose.staging.yml" \
  EXPECTED_RELEASE_SHA="$SHA" EXPECTED_BACKEND_DIGEST="$BE" EXPECTED_STOREFRONT_DIGEST="$SF" \
  APPLY=0 bash "$PIN" --environment public_demo --component storefront >/dev/null 2>&1; then
  fail "component-only scoped ownership accepted"
else
  pass "component-only scoped ownership refused"
fi

# Pair APPLY converges identity without touching deprecated ACTIVE_RELEASE.
SRV="$TMP/srv/woodright"
COMPOSE="$TMP/etc/dokploy/compose/woodright-stack-3dsdhd/code"
OWN="$SRV/runtime-ownership-public-demo"
ID="$SRV/runtime-identity-public-demo"
META="$TMP/meta/public_demo"
LOCK="$SRV/locks/public_demo/live-cutover.lock"
mkdir -p "$OWN" "$ID" "$COMPOSE" "$(dirname "$LOCK")" "$META" "$SRV/reports/public_demo"
: >"$LOCK"

python3 - "$OWN/ACTIVE_OWNER.json" "$STALE_SHA" "$OLD_BE" "$OLD_SF" <<'PY'
import json,sys
from pathlib import Path
p, sha, be, sf = sys.argv[1:5]
Path(p).write_text(json.dumps({
  "approved_git_sha": sha,
  "desired_git_sha": sha,
  "backend_revision": sha,
  "storefront_revision": sha,
  "backend_digest": be,
  "storefront_digest": sf,
  "running_backend_digest": be,
  "running_storefront_digest": sf,
  "owner": "Dokploy",
  "media_volume": "keep-me",
}, indent=2) + "\n")
PY
python3 - "$OWN/EXPECTED_RELEASE.json" "$STALE_SHA" "$OLD_BE" "$OLD_SF" <<'PY'
import json,sys
from pathlib import Path
p, sha, be, sf = sys.argv[1:5]
Path(p).write_text(json.dumps({
  "application_source_sha": sha,
  "release_sha": sha,
  "git_sha": sha,
  "approved_git_sha": sha,
  "backend_digest": be,
  "storefront_digest": sf,
}, indent=2) + "\n")
PY
printf '{"release_sha":"%s","backend_image_digest":"%s","storefront_image_digest":"%s"}\n' "$SHA" "$BE" "$SF" >"$ID/ACTIVE_PUBLIC.json"
printf 'WOODRIGHT_BACKEND_IMAGE=ghcr.io/saintgroovie/woodright-backend@%s\nWOODRIGHT_STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@%s\nSTOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@%s\nWOODRIGHT_RELEASE_SHA=%s\n' "$BE" "$SF" "$SF" "$FILE_SHA" >"$COMPOSE/.env"
printf 'WOODRIGHT_BACKEND_IMAGE=ghcr.io/saintgroovie/woodright-backend@%s\nWOODRIGHT_STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@%s\n' "$BE" "$SF" >"$ID/DOKPLOY_IMAGE_PINS.env"
printf '{"schema_version":1,"tooling_schema_version":"owner-approved-release-v1","environment":"public_demo","application_sha":"%s","backend_digest":"%s","storefront_digest":"%s","owner_decision":"approved","owner_authorization_id":"TEST-OWNER","issued_at":"2026-08-17T16:06:42Z","evidence_reference":"/tmp/evidence"}\n' "$SHA" "$BE" "$SF" >"$META/OWNER_APPROVED_RELEASE.json"
printf '{"deprecated":false,"release_sha":"b56b054bc1c8c8afa25bd9e88c47b530e0ed8cdd"}\n' >"$OWN/ACTIVE_RELEASE.json"
printf 'services: {}\n' >"$COMPOSE/docker-compose.staging.yml"
LEGACY_BEFORE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["release_sha"])' "$OWN/ACTIVE_RELEASE.json")"

CONF="$TMP/profiles/public_demo.conf"
mkdir -p "$TMP/profiles"
python3 - "$REAL_CONF" "$CONF" "$SRV" "$TMP/etc/dokploy" <<'PY'
from pathlib import Path
src, dst, srv, dok = __import__('sys').argv[1:5]
text = Path(src).read_text()
text = text.replace("/srv/woodright", srv).replace("/etc/dokploy", dok)
Path(dst).write_text(text)
PY

unset WOODRIGHT_ENVIRONMENT WOODRIGHT_ACTIVE_OWNER WOODRIGHT_EXPECTED_RELEASE WOODRIGHT_ACTIVE_PUBLIC || true
export WOODRIGHT_ENV_PROFILE_DIR="$TMP/profiles"
export WOODRIGHT_META_ROOT="$TMP/meta"
export WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK=1
export WOODRIGHT_CUTOVER_LOCK_PATH="$LOCK"
export WOODRIGHT_VALIDATION_FREEZE_OVERRIDE=1
export ENV_FILE="$COMPOSE/.env"
export COMPOSE_FILE="$COMPOSE/docker-compose.staging.yml"

if ! EXPECTED_RELEASE_SHA="$SHA" EXPECTED_BACKEND_DIGEST="$BE" EXPECTED_STOREFRONT_DIGEST="$SF" \
  APPLY=1 UPDATE_PINS=1 UPDATE_ACTIVE_PUBLIC=1 UPDATE_ACTIVE_RELEASE=0 UPDATE_SCOPED_OWNERSHIP=1 \
  REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  bash "$PIN" --environment public_demo --component pair >"$TMP/apply.out" 2>&1; then
  fail "pair APPLY scoped converge"
  cat "$TMP/apply.out" || true
else
  pass "pair APPLY scoped converge"
fi

python3 - "$OWN/ACTIVE_OWNER.json" "$OWN/EXPECTED_RELEASE.json" "$COMPOSE/.env" "$OWN/ACTIVE_RELEASE.json" \
  "$SHA" "$BE" "$SF" "$LEGACY_BEFORE" <<'PY'
import json, sys
from pathlib import Path
owner_p, exp_p, env_p, legacy_p, sha, be, sf, legacy_before = sys.argv[1:9]
owner = json.loads(Path(owner_p).read_text())
exp = json.loads(Path(exp_p).read_text())
legacy = json.loads(Path(legacy_p).read_text())
env = {}
for line in Path(env_p).read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k,v=line.split("=",1); env[k]=v
ok = True
def chk(cond, msg):
    global ok
    if not cond:
        print("FAIL", msg)
        ok = False
chk(owner.get("approved_git_sha")==sha, "owner approved")
chk(owner.get("desired_git_sha")==sha, "owner desired")
chk(owner.get("backend_digest")==be and owner.get("storefront_digest")==sf, "owner digests")
chk(owner.get("running_backend_digest")==be, "owner running be")
chk(owner.get("media_volume")=="keep-me", "owner preserved unrelated")
chk(exp.get("application_source_sha")==sha, "expected sha")
chk(exp.get("backend_digest")==be and exp.get("storefront_digest")==sf, "expected digests")
chk(env.get("WOODRIGHT_RELEASE_SHA")==sha, f"compose SHA got={env.get('WOODRIGHT_RELEASE_SHA')}")
chk(legacy.get("release_sha")==legacy_before, "legacy ACTIVE_RELEASE untouched")
sys.exit(0 if ok else 1)
PY
if [[ $? -eq 0 ]]; then
  pass "post-APPLY identity + legacy untouched"
else
  fail "post-APPLY identity checks"
fi

# Restore stale scoped pair for negative cases.
python3 - "$OWN/ACTIVE_OWNER.json" "$STALE_SHA" "$OLD_BE" "$OLD_SF" <<'PY'
import json,sys
from pathlib import Path
p, sha, be, sf = sys.argv[1:5]
Path(p).write_text(json.dumps({
  "approved_git_sha": sha, "desired_git_sha": sha,
  "backend_revision": sha, "storefront_revision": sha,
  "backend_digest": be, "storefront_digest": sf,
  "running_backend_digest": be, "running_storefront_digest": sf,
  "owner": "Dokploy", "media_volume": "keep-me",
}, indent=2) + "\n")
PY
python3 - "$OWN/EXPECTED_RELEASE.json" "$STALE_SHA" "$OLD_BE" "$OLD_SF" <<'PY'
import json,sys
from pathlib import Path
p, sha, be, sf = sys.argv[1:5]
Path(p).write_text(json.dumps({
  "application_source_sha": sha, "release_sha": sha, "git_sha": sha,
  "approved_git_sha": sha, "backend_digest": be, "storefront_digest": sf,
}, indent=2) + "\n")
PY
printf 'WOODRIGHT_BACKEND_IMAGE=ghcr.io/saintgroovie/woodright-backend@%s\nWOODRIGHT_STOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@%s\nSTOREFRONT_IMAGE=ghcr.io/saintgroovie/woodright-storefront@%s\nWOODRIGHT_RELEASE_SHA=%s\n' "$BE" "$SF" "$SF" "$FILE_SHA" >"$COMPOSE/.env"

# Peer disagreement must fail closed.
python3 - "$OWN/EXPECTED_RELEASE.json" "$SHA" "$BE" "$SF" <<'PY'
import json,sys
from pathlib import Path
p, sha, be, sf = sys.argv[1:5]
d=json.loads(Path(p).read_text()); d["application_source_sha"]=sha; d["release_sha"]=sha; d["git_sha"]=sha; d["approved_git_sha"]=sha; d["backend_digest"]=be; d["storefront_digest"]=sf
Path(p).write_text(json.dumps(d, indent=2)+"\n")
PY
if EXPECTED_RELEASE_SHA="$SHA" EXPECTED_BACKEND_DIGEST="$BE" EXPECTED_STOREFRONT_DIGEST="$SF" \
  APPLY=0 UPDATE_PINS=1 UPDATE_ACTIVE_PUBLIC=1 UPDATE_ACTIVE_RELEASE=0 UPDATE_SCOPED_OWNERSHIP=1 \
  REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  bash "$PIN" --environment public_demo --component pair >/dev/null 2>&1; then
  fail "peer disagreement accepted"
else
  pass "peer disagreement refused"
fi
# restore expected peer
python3 - "$OWN/EXPECTED_RELEASE.json" "$STALE_SHA" "$OLD_BE" "$OLD_SF" <<'PY'
import json,sys
from pathlib import Path
p, sha, be, sf = sys.argv[1:5]
Path(p).write_text(json.dumps({
  "application_source_sha": sha, "release_sha": sha, "git_sha": sha,
  "approved_git_sha": sha, "backend_digest": be, "storefront_digest": sf,
}, indent=2) + "\n")
PY

# Foreign production environment field refused.
python3 - "$OWN/ACTIVE_OWNER.json" <<'PY'
import json,sys
from pathlib import Path
p=sys.argv[1]
d=json.loads(Path(p).read_text()); d["environment"]="public_production"
Path(p).write_text(json.dumps(d, indent=2)+"\n")
PY
if EXPECTED_RELEASE_SHA="$SHA" EXPECTED_BACKEND_DIGEST="$BE" EXPECTED_STOREFRONT_DIGEST="$SF" \
  APPLY=0 UPDATE_SCOPED_OWNERSHIP=1 UPDATE_ACTIVE_RELEASE=0 \
  REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  bash "$PIN" --environment public_demo --component pair >/dev/null 2>&1; then
  fail "production environment field accepted"
else
  pass "production environment field refused"
fi
python3 - "$OWN/ACTIVE_OWNER.json" <<'PY'
import json,sys
from pathlib import Path
p=sys.argv[1]
d=json.loads(Path(p).read_text()); d.pop("environment", None)
Path(p).write_text(json.dumps(d, indent=2)+"\n")
PY

python3 - "$OWN/ACTIVE_OWNER.json" <<'PY'
import json,sys
from pathlib import Path
p=sys.argv[1]
d=json.loads(Path(p).read_text()); d["environment"]="public_demo"; d["runtime_role"]="public_production"
Path(p).write_text(json.dumps(d, indent=2)+"\n")
PY
if EXPECTED_RELEASE_SHA="$SHA" EXPECTED_BACKEND_DIGEST="$BE" EXPECTED_STOREFRONT_DIGEST="$SF" \
  APPLY=0 UPDATE_SCOPED_OWNERSHIP=1 UPDATE_ACTIVE_RELEASE=0 \
  REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  bash "$PIN" --environment public_demo --component pair >/dev/null 2>&1; then
  fail "conflicting runtime_role accepted"
else
  pass "conflicting runtime_role refused"
fi
python3 - "$OWN/ACTIVE_OWNER.json" <<'PY'
import json,sys
from pathlib import Path
p=sys.argv[1]
d=json.loads(Path(p).read_text()); d.pop("environment", None); d.pop("runtime_role", None)
Path(p).write_text(json.dumps(d, indent=2)+"\n")
PY

# Caller production ownership path refused even under test lock.
mkdir -p "$TMP/runtime-ownership-public-production"
cp "$OWN/ACTIVE_OWNER.json" "$TMP/runtime-ownership-public-production/ACTIVE_OWNER.json"
if ACTIVE_OWNER_FILE="$TMP/runtime-ownership-public-production/ACTIVE_OWNER.json" \
  EXPECTED_RELEASE_SHA="$SHA" EXPECTED_BACKEND_DIGEST="$BE" EXPECTED_STOREFRONT_DIGEST="$SF" \
  APPLY=0 UPDATE_SCOPED_OWNERSHIP=1 UPDATE_ACTIVE_RELEASE=0 \
  REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  bash "$PIN" --environment public_demo --component pair >/dev/null 2>&1; then
  fail "production ownership path accepted"
else
  pass "production ownership path refused"
fi

# Fault after first scoped JSON install rolls back both files.
python3 - "$OWN/ACTIVE_OWNER.json" "$STALE_SHA" "$OLD_BE" "$OLD_SF" <<'PY'
import json,sys
from pathlib import Path
p, sha, be, sf = sys.argv[1:5]
Path(p).write_text(json.dumps({
  "approved_git_sha": sha, "desired_git_sha": sha,
  "backend_revision": sha, "storefront_revision": sha,
  "backend_digest": be, "storefront_digest": sf,
  "running_backend_digest": be, "running_storefront_digest": sf,
  "owner": "Dokploy", "media_volume": "keep-me",
}, indent=2) + "\n")
PY
BEFORE_OWNER="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$OWN/ACTIVE_OWNER.json")"
BEFORE_EXP="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$OWN/EXPECTED_RELEASE.json")"
WOODRIGHT_PIN_RECONCILE_FAULT_AFTER=scoped_owner \
EXPECTED_RELEASE_SHA="$SHA" EXPECTED_BACKEND_DIGEST="$BE" EXPECTED_STOREFRONT_DIGEST="$SF" \
  APPLY=1 UPDATE_PINS=1 UPDATE_ACTIVE_PUBLIC=1 UPDATE_ACTIVE_RELEASE=0 UPDATE_SCOPED_OWNERSHIP=1 \
  REQUIRE_LIVE_MATCH=0 SKIP_COMPOSE_VALIDATE=1 \
  bash "$PIN" --environment public_demo --component pair >/dev/null 2>&1 || true
AFTER_OWNER="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$OWN/ACTIVE_OWNER.json")"
AFTER_EXP="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$OWN/EXPECTED_RELEASE.json")"
if [[ "$BEFORE_OWNER" == "$AFTER_OWNER" && "$BEFORE_EXP" == "$AFTER_EXP" ]]; then
  pass "scoped_owner fault rolled back JSON"
else
  fail "scoped_owner fault left partial write"
fi

# Outer rollback vars must not retarget production ownership outside test mode.
COMMON="$ROOT/ops/lib/woodright-cutover-common.sh"
mkdir -p "$TMP/runtime-ownership-public-production"
cp -p "$OWN/ACTIVE_OWNER.json" "$TMP/runtime-ownership-public-production/ACTIVE_OWNER.json"
cp -p "$OWN/EXPECTED_RELEASE.json" "$TMP/runtime-ownership-public-production/EXPECTED_RELEASE.json"
if (
  unset WOODRIGHT_PIN_RECONCILE_ALLOW_TEST_LOCK WOODRIGHT_CUTOVER_ALLOW_TEST_PATHS || true
  export WOODRIGHT_ACTIVE_OWNER="$OWN/ACTIVE_OWNER.json"
  export WOODRIGHT_EXPECTED_RELEASE="$OWN/EXPECTED_RELEASE.json"
  export WOODRIGHT_CUTOVER_ACTIVE_OWNER="$TMP/runtime-ownership-public-production/ACTIVE_OWNER.json"
  export WOODRIGHT_CUTOVER_EXPECTED_RELEASE="$TMP/runtime-ownership-public-production/EXPECTED_RELEASE.json"
  # shellcheck source=/dev/null
  source "$COMMON"
  wr_cutover_pin_paths
); then
  fail "hostile WOODRIGHT_CUTOVER_* production path accepted"
else
  pass "hostile WOODRIGHT_CUTOVER_* production path refused"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "---- FAIL=$FAILED ----"
  exit 1
fi
echo "---- PASS all ----"
exit 0
