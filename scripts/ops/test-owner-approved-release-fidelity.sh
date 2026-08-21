#!/usr/bin/env bash
# Fidelity: owner-approved release gate (no Docker mutation / no image pull).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$ROOT/ops/lib/woodright-owner-approved-release.sh"
PAIR="$ROOT/ops/release/cutover-public-demo-pair.sh"
PIN="$ROOT/scripts/release/reconcile-public-image-pins.sh"
FAILED=0
TMP="$(mktemp -d "${TMPDIR:-/tmp}/wr-owner-approved-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

APPROVED_SHA="e485230b024fa533a674876133ff978c0bb5e120"
APPROVED_BE="sha256:29bd8c76a1cc8ef47a9c0ee5db9ff16bbdaabd61d7bc3e40f5db842636914a71"
APPROVED_SF="sha256:33d5ce698edc3482c96b7dff9430cadeb13429c52db80ecac08b1a565128e1ad"
RETIRED_SHA="8f9b914d219757ef0638aadd1c77f8ead253652a"
RETIRED_BE="sha256:5c053fe4d6066c3f31aea13d29f1d53ef244dad92db2059d2f143486dcbdabcc"
RETIRED_SF="sha256:079c02c4defd4d1adb8506037058b25abc1cca810902c0d77d182c6b0fb8585a"
TIP_SHA="600e30c000000000000000000000000000000000"
BAD_BE="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
BAD_SF="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

write_approval() {
  local path="$1" env="${2:-public_demo}" sha="${3:-$APPROVED_SHA}" be="${4:-$APPROVED_BE}" sf="${5:-$APPROVED_SF}"
  mkdir -p "$(dirname "$path")"
  cat >"$path" <<EOF
{
  "schema_version": 1,
  "environment": "$env",
  "application_sha": "$sha",
  "backend_digest": "$be",
  "storefront_digest": "$sf",
  "owner_decision": "approved",
  "owner_authorization_id": "OWNER-PASS-test-owner-auth",
  "issued_at": "2026-08-03T18:00:00Z",
  "previous_approved_application_sha": "$RETIRED_SHA",
  "evidence_reference": "fixture",
  "tooling_schema_version": "owner-approved-release-v1"
}
EOF
  chmod 0644 "$path"
}

# shellcheck source=/dev/null
source "$LIB"

grep -q 'woodright-owner-approved-release.sh' "$PAIR" || fail "pair missing owner lib"
grep -q 'wr_require_owner_approved_release' "$PAIR" || fail "pair missing Gate A"
grep -q 'wr_require_owner_approved_release_under_lock' "$PAIR" || fail "pair missing Gate B"
grep -q 'wr_require_owner_approved_matches_live' "$PAIR" || fail "pair missing Gate C"
python3 - "$PAIR" <<'PY' || fail "Gate A not before image require"
from pathlib import Path
import sys
t = Path(sys.argv[1]).read_text()
a = t.find("wr_require_owner_approved_release")
b = t.find("wr_cutover_require_image_at_digest")
sys.exit(0 if 0 <= a < b else 1)
PY
pass "pair Gate A precedes image require"
grep -q 'wr_require_owner_approved_release_under_lock' "$ROOT/ops/release/recreate-staging-backend-with-media.sh" \
  || fail "backend recreate missing Gate B"
grep -q 'wr_require_owner_approved_release_under_lock' "$ROOT/ops/release/recreate-staging-storefront.sh" \
  || fail "storefront recreate missing Gate B"
pass "standalone recreates have Gate B under lock"
grep -q 'wr_require_owner_approved_release' "$PIN" || fail "pin reconcile missing owner gate"
grep -q 'bind_pair_owner_approval_peers' "$PAIR" || fail "pair missing peer bind helper"
grep -q 'WOODRIGHT_OWNER_APPROVAL_PEER_SF_DIGEST' "$PAIR" || fail "pair missing peer SF export"
grep -q 'WOODRIGHT_OWNER_APPROVAL_PEER_BE_DIGEST' "$PAIR" || fail "pair missing peer BE export"
grep -q 'mismatch vs pair plan' "$PAIR" || fail "pair missing peer spoof refusal"
pass "pair peer-authority bind contract present"
if awk '/WOODRIGHT_VALIDATION_FREEZE_OVERRIDE/ { if ($0 ~ /return 0/ || $0 ~ /OWNER_APPROVAL_OK/) bad=1 } END { exit bad ? 0 : 1 }' "$LIB"; then
  fail "freeze override appears to authorize release"
else
  pass "freeze override not an owner-gate bypass in lib"
fi
if grep -E 'euid.*==.*0|id -u.*==.*0' "$LIB" | grep -qi 'return 0\|skip\|bypass'; then
  fail "possible euid bypass"
else
  pass "no euid=0 owner-gate bypass"
fi
grep -q 'WOODRIGHT_DISABLE_OWNER_APPROVAL' "$LIB" && pass "disable flag explicitly denied" || fail "missing disable denial"
# Path override must be refused unconditionally
if grep -q 'WOODRIGHT_OWNER_APPROVED_RELEASE_PATH' "$LIB" && grep -A6 'wr_owner_approved_resolve_path' "$LIB" | grep -q 'return 1'; then
  pass "path override refused in resolve"
else
  fail "path override still accepted"
fi

mkdir -p "$TMP/ev/json"
export WOODRIGHT_META_ROOT="$TMP/meta-root"
mkdir -p "$WOODRIGHT_META_ROOT/public_demo/emergency"
APPROVAL="$WOODRIGHT_META_ROOT/public_demo/OWNER_APPROVED_RELEASE.json"
write_approval "$APPROVAL"
unset WOODRIGHT_OWNER_APPROVED_RELEASE_PATH
export WOODRIGHT_OWNER_APPROVAL_REQUIRE_PAIR=1

if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_OK" ]] && pass "exact approved PASS" || fail "approved result token"
else
  fail "exact approved blocked"
fi
GATE_A_CS="$WR_OA_CHECKSUM"

if wr_require_owner_approved_release public_demo "$RETIRED_SHA" "$RETIRED_BE" "$RETIRED_SF" "$TMP/ev" gate_a; then
  fail "retired SHA accepted"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_MISMATCH" ]] && pass "retired BLOCK" || fail "retired token=$WR_OWNER_APPROVAL_RESULT"
fi
[[ -f "$TMP/ev/json/owner-approval-denial.json" ]] && pass "audit denial written" || fail "no denial audit"

if wr_require_owner_approved_release public_demo "$TIP_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "tip-main accepted"
else
  pass "tip-main BLOCK"
fi

if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$BAD_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "backend digest mismatch accepted"
else
  pass "backend digest mismatch BLOCK"
fi
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$BAD_SF" "$TMP/ev" gate_a; then
  fail "storefront digest mismatch accepted"
else
  pass "storefront digest mismatch BLOCK"
fi
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "sha256:29bd8c76" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "digest prefix accepted"
else
  pass "digest prefix BLOCK"
fi
if wr_require_owner_approved_release public_demo "e485230b024fa533a674876133ff978c0bb5e12" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "sha prefix accepted"
else
  pass "sha prefix BLOCK"
fi

rm -f "$APPROVAL"
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "missing approval accepted"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_MISSING" ]] && pass "missing approval BLOCK" || fail "missing token=$WR_OWNER_APPROVAL_RESULT"
fi
write_approval "$APPROVAL"

printf '{not json\n' >"$APPROVAL"
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "malformed accepted"
else
  pass "malformed BLOCK"
fi
write_approval "$APPROVAL"

cat >"$APPROVAL" <<'EOF'
{"schema_version":1,"schema_version":2,"environment":"public_demo","application_sha":"e485230b024fa533a674876133ff978c0bb5e120","backend_digest":"sha256:29bd8c76a1cc8ef47a9c0ee5db9ff16bbdaabd61d7bc3e40f5db842636914a71","storefront_digest":"sha256:33d5ce698edc3482c96b7dff9430cadeb13429c52db80ecac08b1a565128e1ad","owner_decision":"approved"}
EOF
chmod 0644 "$APPROVAL"
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "duplicate fields accepted"
else
  pass "duplicate fields BLOCK"
fi
write_approval "$APPROVAL"

write_approval "$APPROVAL" public_production
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "production approval accepted for public_demo"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_ENV_MISMATCH" ]] && pass "env mismatch BLOCK" || fail "env token=$WR_OWNER_APPROVAL_RESULT"
fi
write_approval "$APPROVAL"

rm -f "$APPROVAL"
ln -sf /etc/hosts "$APPROVAL"
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "symlink accepted"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_PATH_UNSAFE" ]] && pass "symlink BLOCK" || fail "symlink token=$WR_OWNER_APPROVAL_RESULT"
fi
rm -f "$APPROVAL"
write_approval "$APPROVAL"

chmod 0666 "$APPROVAL"
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "world-writable accepted"
else
  pass "world-writable BLOCK"
fi
chmod 0644 "$APPROVAL"
write_approval "$APPROVAL"

if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  CS1="$WR_OA_CHECKSUM"
  python3 -c 'import json,pathlib;p=pathlib.Path("'"$APPROVAL"'");d=json.loads(p.read_text());d["issued_at"]="2026-08-04T00:00:00Z";p.write_text(json.dumps(d,indent=2));p.chmod(0o644)'
  if wr_require_owner_approved_release_under_lock public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" "$CS1"; then
    fail "TOCTOU checksum drift accepted"
  else
    [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_TOCTOU" ]] && pass "TOCTOU BLOCK" || fail "toctou token=$WR_OWNER_APPROVAL_RESULT"
  fi
else
  fail "gate_a for toctou setup failed"
fi
write_approval "$APPROVAL"

export WOODRIGHT_VALIDATION_FREEZE_OVERRIDE=1
if wr_require_owner_approved_release public_demo "$RETIRED_SHA" "$RETIRED_BE" "$RETIRED_SF" "$TMP/ev" gate_a; then
  fail "freeze override authorized retired SHA"
else
  pass "freeze override + retired BLOCK"
fi
unset WOODRIGHT_VALIDATION_FREEZE_OVERRIDE

export WOODRIGHT_DISABLE_OWNER_APPROVAL=1
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "DISABLE_OWNER_APPROVAL accepted"
else
  pass "DISABLE_OWNER_APPROVAL BLOCK"
fi
unset WOODRIGHT_DISABLE_OWNER_APPROVAL

export WOODRIGHT_OWNER_EMERGENCY_ROLLBACK=1
export WOODRIGHT_OWNER_EMERGENCY_REASON="restore-owner-baseline-after-stale-packet"
mkdir -p "$TMP/meta"
cat >"$TMP/meta/emerg-wrong.json" <<EOF
{
  "kind": "pre_cutover_identity",
  "attested_at": "2026-08-03T00:00:00Z",
  "environment": "public_demo",
  "application_sha": "$RETIRED_SHA",
  "backend_digest": "$RETIRED_BE",
  "storefront_digest": "$RETIRED_SF"
}
EOF
export WOODRIGHT_OWNER_EMERGENCY_MANIFEST="$TMP/meta/emerg-wrong.json"
rm -f "$APPROVAL"
if wr_require_owner_approved_release public_demo "$RETIRED_SHA" "$RETIRED_BE" "$RETIRED_SF" "$TMP/ev" gate_a; then
  fail "emergency authorized outside canonical dir"
else
  pass "emergency outside canonical dir BLOCK"
fi
cat >"$WOODRIGHT_META_ROOT/public_demo/emergency/pre-cutover.json" <<EOF
{
  "kind": "pre_cutover_identity",
  "attested_at": "2026-08-03T00:00:00Z",
  "environment": "public_demo",
  "application_sha": "$RETIRED_SHA",
  "backend_digest": "$RETIRED_BE",
  "storefront_digest": "$RETIRED_SF"
}
EOF
chmod 0644 "$WOODRIGHT_META_ROOT/public_demo/emergency/pre-cutover.json"
export WOODRIGHT_OWNER_EMERGENCY_MANIFEST="$WOODRIGHT_META_ROOT/public_demo/emergency/pre-cutover.json"
if wr_require_owner_approved_release public_demo "$RETIRED_SHA" "$RETIRED_BE" "$RETIRED_SF" "$TMP/ev" gate_a; then
  pass "emergency exact pre-cutover ALLOW"
else
  fail "emergency exact denied result=$WR_OWNER_APPROVAL_RESULT"
fi
unset WOODRIGHT_OWNER_EMERGENCY_ROLLBACK WOODRIGHT_OWNER_EMERGENCY_REASON WOODRIGHT_OWNER_EMERGENCY_MANIFEST
write_approval "$APPROVAL"

# Any WOODRIGHT_OWNER_APPROVED_RELEASE_PATH must fail closed
export WOODRIGHT_OWNER_APPROVED_RELEASE_PATH="$APPROVAL"
if wr_require_owner_approved_release public_demo "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "path override env accepted"
else
  [[ "$WR_OWNER_APPROVAL_RESULT" == "OWNER_APPROVAL_PATH_UNSAFE" ]] && pass "path override env BLOCK" || fail "override token=$WR_OWNER_APPROVAL_RESULT"
fi
unset WOODRIGHT_OWNER_APPROVED_RELEASE_PATH

grep -q 'woodright-owner-approved-release.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing owner lib"
grep -q 'reconcile-owner-approved-release.sh' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing reconcile-owner-approved"
grep -q 'woodright-owner-approved-release.sh' "$ROOT/ops/release/verify-environment-governance-bundle.sh" \
  || fail "verifier missing owner lib"
grep -q 'owner-approved-release-governance.md' "$ROOT/ops/release/install-environment-governance.sh" \
  || fail "installer missing owner docs"
pass "installer/verifier allowlist includes owner-approval"

if grep -qiE 'PASSWORD|SECRET|TOKEN=' "$TMP/ev/json/owner-approval-denial.json" 2>/dev/null; then
  fail "denial may leak secrets"
else
  pass "denial audit redaction ok"
fi
if grep -q 'wr_cutover_require_confirm' "$PAIR" && grep -q 'wr_require_owner_approved_release' "$PAIR"; then
  pass "confirm token not sole authorization (owner gate present)"
else
  fail "confirm/owner gate relationship unclear"
fi

PP="$ROOT/ops/release/cutover-public-production-pair.sh"
grep -q 'wr_require_owner_approved_release' "$PP" || fail "public_production pair missing Gate A"
grep -q 'wr_require_owner_approved_release_under_lock' "$PP" || fail "public_production pair missing Gate B"
grep -q 'wr_require_owner_approved_matches_live' "$PP" || fail "public_production pair missing Gate C"
grep -q 'WOODRIGHT_OWNER_APPROVAL_STRICT_ENVIRONMENT=1' "$PP" || fail "public_production pair missing strict environment"
pass "public_production pair has Gate A/B/C + strict environment"

WRITE="$ROOT/ops/release/reconcile-owner-approved-release.sh"
if bash "$WRITE" --environment production --application-sha "$APPROVED_SHA" \
  --backend-digest "$APPROVED_BE" --storefront-digest "$APPROVED_SF" \
  --owner-authorization-id OWNER-PASS-test-owner-auth \
  --evidence-reference "$TMP" --evidence-dir "$TMP/ev-prod-alias" >/dev/null 2>&1; then
  fail "approval writer accepted --environment production alias"
else
  pass "approval writer refuses production alias"
fi

export WOODRIGHT_OWNER_APPROVAL_STRICT_ENVIRONMENT=1
write_approval "$WOODRIGHT_META_ROOT/public_production/OWNER_APPROVED_RELEASE.json" public_production
if wr_require_owner_approved_release public_production "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  pass "strict public_production approval ALLOW"
else
  fail "strict public_production denied result=$WR_OWNER_APPROVAL_RESULT"
fi
write_approval "$WOODRIGHT_META_ROOT/public_production/OWNER_APPROVED_RELEASE.json" production
if wr_require_owner_approved_release public_production "$APPROVED_SHA" "$APPROVED_BE" "$APPROVED_SF" "$TMP/ev" gate_a; then
  fail "strict mode accepted production-aliased manifest"
else
  pass "strict mode rejects production-aliased manifest result=$WR_OWNER_APPROVAL_RESULT"
fi
unset WOODRIGHT_OWNER_APPROVAL_STRICT_ENVIRONMENT
write_approval "$APPROVAL"

if [[ "$FAILED" -eq 0 ]]; then
  echo "ALL OWNER-APPROVED RELEASE FIDELITY TESTS PASSED"
  exit 0
fi
echo "FAILED=$FAILED"
exit 1
