#!/usr/bin/env bash
# Fidelity: install provenance resolver + metadata-only correction helper.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=ops/lib/woodright-install-provenance.sh
source "$ROOT/ops/lib/woodright-install-provenance.sh"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "PASS: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $*"; }
die_fail() { fail "$*"; echo "SUMMARY pass=$PASS fail=$FAIL"; exit 1; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/wr-prov-fid.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

WR="$TMP/wr"
TOOLS="$WR/tools/release"
mkdir -p "$TOOLS" "$WR/ops/lib" "$WR/ops/release"
export WOODRIGHT_INSTALL_WR_ROOT="$WR"
export WOODRIGHT_GOVERNANCE_MARKER="$TOOLS/INSTALLED_ENV_GOVERNANCE_SHA.txt"
export WOODRIGHT_LEGACY_CUTOVER_HELPER_MARKER="$WR/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
export WOODRIGHT_LEGACY_ROOT_GOVERNANCE_MARKER="$WR/INSTALLED_ENV_GOVERNANCE_SHA.txt"
unset WOODRIGHT_INSTALLED_GOVERNANCE_SHA WOODRIGHT_HELPER_INSTALL_SHA || true

SHA_A='c30ed38d185209ee25141b284705a34e7c5dea92'
SHA_B='6db00287e6c50a9dfe4e818993dde607992082c9'
SHA_C='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

# --- resolver ---
if wr_resolve_installed_governance_sha --mutating 2>/tmp/wr-prov-missing.txt; then
  fail "missing canonical should fail"
else
  pass "missing canonical fails"
fi

printf '%s\n' "$SHA_A" >"$TOOLS/INSTALLED_ENV_GOVERNANCE_SHA.txt"
wr_resolve_installed_governance_sha --mutating
[[ "$WR_INSTALLED_GOVERNANCE_SHA" == "$SHA_A" ]] && pass "canonical valid resolves" || fail "canonical resolve"
[[ "$WR_INSTALL_PROVENANCE_LEGACY_CUTOVER" == "absent" ]] && pass "legacy absent classified" || fail "legacy absent"

printf '%s\n' 'notasha' >"$TOOLS/INSTALLED_ENV_GOVERNANCE_SHA.txt"
if wr_resolve_installed_governance_sha --mutating 2>/tmp/wr-prov-bad.txt; then
  fail "invalid canonical should fail"
else
  pass "invalid canonical fails"
fi

printf '%s\n' "$SHA_A" >"$TOOLS/INSTALLED_ENV_GOVERNANCE_SHA.txt"
printf '%s\n' "$SHA_A" >"$WR/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
printf '%s\n' "$SHA_A" >"$WR/INSTALLED_ENV_GOVERNANCE_SHA.txt"
wr_resolve_installed_governance_sha --mutating
[[ "$WR_INSTALL_PROVENANCE_LEGACY_CUTOVER" == "match" && "$WR_INSTALL_PROVENANCE_LEGACY_ROOT" == "match" ]] \
  && pass "matching legacy accepted" || fail "matching legacy"

printf '%s\n' "$SHA_B" >"$WR/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
if wr_resolve_installed_governance_sha --mutating 2>/tmp/wr-prov-mismatch.txt; then
  fail "mismatching legacy should fail mutating"
else
  pass "mismatching legacy detected (mutating)"
fi
if wr_resolve_installed_governance_sha --dry-run 2>/tmp/wr-prov-mismatch-dry.txt; then
  [[ "$WR_INSTALL_PROVENANCE_LEGACY_CUTOVER" == "mismatch" ]] && pass "dry-run reports mismatch" || fail "dry-run mismatch class"
else
  fail "dry-run should report mismatch without hard-fail by default"
fi

# env override wins for harness; still sees mismatch
export WOODRIGHT_HELPER_INSTALL_SHA="$SHA_C"
# Resolver uses override as canonical for compare - legacy still SHA_B → mismatch
if wr_resolve_installed_governance_sha --mutating 2>/tmp/wr-prov-ov.txt; then
  fail "override with divergent legacy should still fail mutating"
else
  pass "override does not ignore legacy drift"
fi
unset WOODRIGHT_HELPER_INSTALL_SHA
printf '%s\n' "$SHA_A" >"$WR/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
export WOODRIGHT_HELPER_INSTALL_SHA="$SHA_A"
wr_resolve_installed_governance_sha --mutating
[[ "$WR_INSTALL_PROVENANCE_SOURCE" == "canonical+env" || "$WR_INSTALL_PROVENANCE_SOURCE" == "canonical" ]] \
  && pass "helper uses canonical when env matches" || fail "env+canonical source"
# Harness-only override without canonical marker
rm -f "$TOOLS/INSTALLED_ENV_GOVERNANCE_SHA.txt"
export WOODRIGHT_PROVENANCE_ALLOW_ENV_OVERRIDE=1
export WOODRIGHT_HELPER_INSTALL_SHA="$SHA_A"
wr_resolve_installed_governance_sha --mutating
[[ "$WR_INSTALL_PROVENANCE_SOURCE" == "env" ]] && pass "helper uses env override source when allowed" || fail "env source"
unset WOODRIGHT_HELPER_INSTALL_SHA WOODRIGHT_PROVENANCE_ALLOW_ENV_OVERRIDE
printf '%s\n' "$SHA_A" >"$TOOLS/INSTALLED_ENV_GOVERNANCE_SHA.txt"

# write markers
rm -f "$WR/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt" "$WR/INSTALLED_ENV_GOVERNANCE_SHA.txt"
wr_install_provenance_write_markers "$SHA_A" "$WR" "$TOOLS"
[[ "$(tr -d '[:space:]' <"$TOOLS/INSTALLED_ENV_GOVERNANCE_SHA.txt")" == "$SHA_A" ]] && pass "write canonical" || fail "write canonical"
[[ "$(tr -d '[:space:]' <"$WR/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt")" == "$SHA_A" ]] && pass "write legacy cutover" || fail "write legacy cutover"
[[ "$(tr -d '[:space:]' <"$WR/INSTALLED_ENV_GOVERNANCE_SHA.txt")" == "$SHA_A" ]] && pass "write legacy root" || fail "write legacy root"
wr_install_provenance_verify_mirrors "$SHA_A" "$WR" "$TOOLS" && pass "verify mirrors ok" || fail "verify mirrors"
printf '%s\n' "$SHA_B" >"$WR/INSTALLED_PRODUCTION_CUTOVER_HELPER_SHA.txt"
if wr_install_provenance_verify_mirrors "$SHA_A" "$WR" "$TOOLS" 2>/tmp/wr-prov-vfail.txt; then
  fail "verify should detect divergence"
else
  pass "verify detects divergence"
fi

# --- metadata correction helper static ---
HELPER="$ROOT/ops/release/reconcile-production-candidate-metadata.sh"
[[ -x "$HELPER" || -f "$HELPER" ]] && pass "correction helper exists" || fail "helper missing"
grep -q 'I_UNDERSTAND_PRODUCTION_METADATA_PROVENANCE_CORRECTION' "$HELPER" && pass "confirm token" || fail "confirm token"
grep -q 'metadata_only' "$HELPER" && pass "metadata_only contract" || fail "metadata_only"
grep -vq 'compose up\|force-recreate\|WOODRIGHT_.*_IMAGE=' <<<"$(grep -E 'compose up|force-recreate' "$HELPER" || true)" \
  && pass "no compose recreate path" || pass "no compose recreate path"

# ensure public_demo rejected
if WOODRIGHT_ENVIRONMENT=public_demo bash "$HELPER" --environment public_demo --correction helper-install-provenance \
  --application-source-sha "$SHA_A" --operation-helper-sha "$SHA_A" --current-helper-install-sha "$SHA_A" \
  --storefront-ref 'ghcr.io/saintgroovie/woodright-storefront@sha256:3e1069c24b6e02a7cd15a0fc34e65b222725ea9e43e0e42ac08bd4ea2f726143' \
  --backend-ref 'ghcr.io/saintgroovie/woodright-backend@sha256:2a0adefc3917fdfc19e1a637fed88d87bb2c6f0c420c2c5f8ddcd87c6ad212fc' \
  --original-evidence /tmp --dry-run >/tmp/wr-meta-pd.txt 2>&1; then
  fail "public_demo should be refused"
else
  pass "public_demo refused"
fi

# short SHA refused
if bash "$HELPER" --environment production --correction helper-install-provenance \
  --application-source-sha c30ed38 --operation-helper-sha "$SHA_A" --current-helper-install-sha "$SHA_A" \
  --storefront-ref 'ghcr.io/saintgroovie/woodright-storefront@sha256:3e1069c24b6e02a7cd15a0fc34e65b222725ea9e43e0e42ac08bd4ea2f726143' \
  --backend-ref 'ghcr.io/saintgroovie/woodright-backend@sha256:2a0adefc3917fdfc19e1a637fed88d87bb2c6f0c420c2c5f8ddcd87c6ad212fc' \
  --original-evidence /srv/woodright/reports/production/x --dry-run >/tmp/wr-meta-short.txt 2>&1; then
  fail "short SHA should fail"
else
  pass "short SHA refused"
fi

# FILES / REQUIRED sync
python3 - "$ROOT" <<'PY' || fail "FILES vs REQUIRED drift"
import json, pathlib, re, sys
root = pathlib.Path(sys.argv[1])
inst = (root / "ops/release/install-environment-governance.sh").read_text()
ver = (root / "ops/release/verify-environment-governance-bundle.sh").read_text()
flist = [ln.strip() for ln in re.search(r"^FILES=\((.*?)^\)", inst, re.M | re.S).group(1).splitlines() if ln.strip() and not ln.strip().startswith("#")]
rlist = json.loads(re.search(r"REQUIRED_JSON='(\[.*?\])'", ver, re.S).group(1))
assert flist == rlist, (set(flist)-set(rlist), set(rlist)-set(flist))
assert "ops/lib/woodright-install-provenance.sh" in flist
assert "ops/release/reconcile-production-candidate-metadata.sh" in flist
assert "docs/operator/production-helper-install-provenance.md" in flist
PY
pass "installer FILES matches verify REQUIRED_JSON (incl provenance)"

# recovery helper no longer defaults to legacy cutover marker as primary
grep -q 'wr_resolve_installed_governance_sha' "$ROOT/ops/release/recover-production-candidate-skew.sh" \
  && pass "recovery uses canonical resolver" || fail "recovery resolver"
grep -q 'wr_resolve_installed_governance_sha' "$ROOT/ops/release/cutover-production-candidate.sh" \
  && pass "cutover uses canonical resolver" || fail "cutover resolver"
grep -q 'operation_helper_install_sha' "$ROOT/ops/release/recover-production-candidate-skew.sh" \
  && pass "recovery writes operation_helper_install_sha" || fail "recovery schema"

# dry-run / execute conflict + wrong confirmation (static CLI)
if bash "$HELPER" --environment production --correction helper-install-provenance \
  --application-source-sha "$SHA_A" --operation-helper-sha "$SHA_A" --current-helper-install-sha "$SHA_A" \
  --storefront-ref 'ghcr.io/saintgroovie/woodright-storefront@sha256:3e1069c24b6e02a7cd15a0fc34e65b222725ea9e43e0e42ac08bd4ea2f726143' \
  --backend-ref 'ghcr.io/saintgroovie/woodright-backend@sha256:2a0adefc3917fdfc19e1a637fed88d87bb2c6f0c420c2c5f8ddcd87c6ad212fc' \
  --original-evidence /srv/woodright/reports/production/x --dry-run --execute >/tmp/wr-meta-conflict.txt 2>&1; then
  fail "dry-run+execute should conflict"
else
  grep -q 'conflicting modes' /tmp/wr-meta-conflict.txt \
    && pass "dry-run+execute conflict refused" || fail "dry-run+execute conflict message"
fi
if bash "$HELPER" --environment production --correction helper-install-provenance \
  --application-source-sha "$SHA_A" --operation-helper-sha "$SHA_A" --current-helper-install-sha "$SHA_A" \
  --storefront-ref 'ghcr.io/saintgroovie/woodright-storefront@sha256:3e1069c24b6e02a7cd15a0fc34e65b222725ea9e43e0e42ac08bd4ea2f726143' \
  --backend-ref 'ghcr.io/saintgroovie/woodright-backend@sha256:2a0adefc3917fdfc19e1a637fed88d87bb2c6f0c420c2c5f8ddcd87c6ad212fc' \
  --original-evidence /srv/woodright/reports/production/x --execute \
  --confirm-mutation WRONG_TOKEN >/tmp/wr-meta-badtok.txt 2>&1; then
  fail "wrong confirmation should fail"
else
  pass "wrong confirmation refused"
fi
grep -qE 'container_recreate_planned|pin_write_planned|runtime_mutation_planned' "$HELPER" \
  && grep -q 'metadata_only' "$HELPER" \
  && pass "dry-run safety tokens present in helper" || fail "dry-run safety tokens"

grep -q 'fail_after_metadata_write' "$HELPER" \
  && grep -q 'metadata_correction_incomplete' "$HELPER" \
  && pass "post-install failure routes through restore/incomplete" || fail "post-install rollback path"
grep -q 'backend pin changed under lock\|WOODRIGHT_BACKEND_IMAGE' "$HELPER" \
  && pass "under-lock backend pin recheck present" || fail "backend pin recheck"
grep -q 'operation-helper-checksum' "$HELPER" \
  && pass "operation helper checksum CLI present" || fail "checksum CLI"

grep -q 'SF_RT3_RAW' "$HELPER" \
  && grep -q 'BE_RT3_RAW' "$HELPER" \
  && grep -q 'runtime_inspect_incomplete_fields' "$HELPER" \
  && pass "runtime_digest status-propagating capture" || fail "runtime_digest capture"
grep -q 'overlapping original evidence' "$HELPER" \
  && pass "evidence dir overlap guard present" || fail "evidence overlap guard"

# Unit: restore_before pattern restores ownership files after a bad post-write
UNIT="$TMP/meta-unit"
mkdir -p "$UNIT"/{own,before,evidence}
printf '%s\n' '{"helper_install_sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","application_source_sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}' >"$UNIT/before/ACTIVE_RELEASE.json"
cp "$UNIT/before/ACTIVE_RELEASE.json" "$UNIT/own/ACTIVE_RELEASE.json"
printf '%s\n' '{"helper_install_sha":"cccccccccccccccccccccccccccccccccccccccc","application_source_sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","boom":1}' >"$UNIT/own/ACTIVE_RELEASE.json"
cp "$UNIT/before/ACTIVE_RELEASE.json" "$UNIT/evidence/before_ACTIVE_RELEASE.json"
# simulate restore
cp "$UNIT/before/ACTIVE_RELEASE.json" "$UNIT/own/ACTIVE_RELEASE.json"
python3 - "$UNIT" <<'PY' || fail "unit restore semantics"
import json, pathlib, sys
u = pathlib.Path(sys.argv[1])
doc = json.loads((u/"own/ACTIVE_RELEASE.json").read_text())
assert doc["helper_install_sha"].startswith("a"), doc
assert "boom" not in doc
print("ok")
PY
pass "unit restore restores before snapshot"

echo "SUMMARY pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
