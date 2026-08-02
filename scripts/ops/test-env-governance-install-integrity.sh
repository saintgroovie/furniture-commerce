#!/usr/bin/env bash
# Installer / bundle integrity + mixed-bundle regression for environment governance.
# Uses disposable WR_ROOT under TMPDIR; does not touch live /srv/woodright.
#
#   bash scripts/ops/test-env-governance-install-integrity.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "PASS: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $*"; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/wr-env-gov-install-XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

SHA="$(git -C "$ROOT" rev-parse HEAD)"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "bad HEAD"; exit 1; }

# Disposable fake git repo that mirrors bundle FILES from ROOT at exact SHA content.
HARNESS="$TMP/src"
mkdir -p "$HARNESS"
git -C "$HARNESS" init -q
git -C "$HARNESS" config user.email "ops@woodright.test"
git -C "$HARNESS" config user.name "Woodright Ops Test"

# Copy only FILES listed by installer dry-run (from ROOT tree).
# Parse FILES=(...) from installer source (avoid dirty-worktree dry-run refuse).
FILES=()
in_files=0
while IFS= read -r line; do
  if [[ "$line" == "FILES=(" ]]; then in_files=1; continue; fi
  if [[ "$in_files" -eq 1 ]]; then
    if [[ "$line" == ")" ]]; then break; fi
    rel="${line//\"/}"
    rel="${rel//\'/}"
    rel="$(printf '%s' "$rel" | tr -d '[:space:]')"
    [[ -n "$rel" ]] && FILES+=("$rel")
  fi
done < "$ROOT/ops/release/install-environment-governance.sh"
[[ "${#FILES[@]}" -gt 10 ]] || { echo "FILES list too small count=${#FILES[@]}"; exit 1; }

for rel in "${FILES[@]}"; do
  mkdir -p "$HARNESS/$(dirname "$rel")"
  cp -a "$ROOT/$rel" "$HARNESS/$rel"
done
# Installer itself must be the version under test (already copied if in FILES).
git -C "$HARNESS" add -A
git -C "$HARNESS" commit -q -m "bundle snapshot"
# Force HEAD to match --source-sha by amending with env? Can't set arbitrary SHA.
# Instead: rewrite installer call to use HARNESS HEAD as SOURCE_SHA.
SHA_H="$(git -C "$HARNESS" rev-parse HEAD)"

WR_A="$TMP/wr-a"
WR_B="$TMP/wr-b"
mkdir -p "$WR_A/ops" "$WR_B/ops" "$TMP/backups-a" "$TMP/backups-b"

install_into() {
  local wr="$1" backup_root="$2"
  WOODRIGHT_INSTALL_WR_ROOT="$wr" \
  WOODRIGHT_INSTALL_BACKUP_ROOT="$backup_root" \
  bash "$HARNESS/ops/release/install-environment-governance.sh" \
    --source-sha "$SHA_H" \
    --repo-root "$HARNESS" \
    --ops-root "$wr/ops"
}

# 1) Full install A
if install_into "$WR_A" "$TMP/backups-a" >/tmp/wr-install-a.out 2>&1; then
  ok "1_full_install_A"
else
  fail "1_full_install_A"; tail -20 /tmp/wr-install-a.out
fi
MARKER_A="$(tr -d '[:space:]' <"$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt")"
[[ "$MARKER_A" == "$SHA_H" ]] && ok "1_marker_A" || fail "1_marker_A have=$MARKER_A"

if bash "$WR_A/ops/release/verify-environment-governance-bundle.sh" \
  --ops-root "$WR_A/ops" \
  --expected-sha "$SHA_H" \
  --manifest "$WR_A/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json" \
  --marker "$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt" >/tmp/wr-verify-a.out 2>&1; then
  ok "1_verify_A"
else
  fail "1_verify_A"; cat /tmp/wr-verify-a.out
fi

# 2) Mutate one installed file -> verify fails (mixed)
echo "# drift" >>"$WR_A/ops/lib/woodright-cutover-common.sh"
if bash "$WR_A/ops/release/verify-environment-governance-bundle.sh" \
  --ops-root "$WR_A/ops" \
  --expected-sha "$SHA_H" \
  --manifest "$WR_A/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json" \
  --marker "$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt" >/tmp/wr-verify-mixed.out 2>&1; then
  fail "2_mixed_should_fail"
else
  ok "2_mixed_detected"
  grep -q "checksum mismatch" /tmp/wr-verify-mixed.out && ok "2_mismatch_detail" || fail "2_mismatch_detail"
fi

# 3) Re-install A restores integrity
if install_into "$WR_A" "$TMP/backups-a2" >/tmp/wr-install-a2.out 2>&1; then
  ok "3_reinstall_clears_mixed"
else
  fail "3_reinstall_clears_mixed"; tail -20 /tmp/wr-install-a2.out
fi
bash "$WR_A/ops/release/verify-environment-governance-bundle.sh" \
  --ops-root "$WR_A/ops" --expected-sha "$SHA_H" \
  --manifest "$WR_A/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json" \
  --marker "$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt" >/dev/null \
  && ok "3_verify_after_reinstall" || fail "3_verify_after_reinstall"

# 4) Install B into separate root
if install_into "$WR_B" "$TMP/backups-b" >/tmp/wr-install-b.out 2>&1; then
  ok "4_full_install_B"
else
  fail "4_full_install_B"; tail -20 /tmp/wr-install-b.out
fi

# 5) Missing file refuse on verify (delete after install)
rm -f "$WR_B/ops/lib/woodright-host-publish.sh"
if bash "$WR_B/ops/release/verify-environment-governance-bundle.sh" \
  --ops-root "$WR_B/ops" --expected-sha "$SHA_H" \
  --manifest "$WR_B/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json" \
  --marker "$WR_B/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt" >/tmp/wr-missing.out 2>&1; then
  fail "5_missing_should_fail"
else
  ok "5_missing_detected"
fi

# 6) Dirty source refuse
echo "# dirty" >>"$HARNESS/ops/lib/woodright-cutover-common.sh"
set +e
WOODRIGHT_INSTALL_WR_ROOT="$TMP/wr-dirty" \
WOODRIGHT_INSTALL_BACKUP_ROOT="$TMP/backups-dirty" \
bash "$HARNESS/ops/release/install-environment-governance.sh" \
  --source-sha "$SHA_H" --repo-root "$HARNESS" --ops-root "$TMP/wr-dirty/ops" \
  >/tmp/wr-dirty.out 2>&1
RC=$?
set -e
# restore harness file for completeness
git -C "$HARNESS" checkout -- ops/lib/woodright-cutover-common.sh
[[ "$RC" -ne 0 ]] && ok "6_dirty_source_refused" || fail "6_dirty_source_refused"

# 7) Wrong --source-sha refuse
set +e
WOODRIGHT_INSTALL_WR_ROOT="$TMP/wr-wrongsha" \
WOODRIGHT_INSTALL_BACKUP_ROOT="$TMP/backups-wrongsha" \
bash "$HARNESS/ops/release/install-environment-governance.sh" \
  --source-sha 0000000000000000000000000000000000000000 \
  --repo-root "$HARNESS" --ops-root "$TMP/wr-wrongsha/ops" \
  >/tmp/wr-wrongsha.out 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && ok "7_wrong_source_sha_refused" || fail "7_wrong_source_sha_refused"

# 8) Simulated incident mixed inventory: marker 127c473 + drifted common
# Rebuild clean A then forge marker text while keeping manifest from install.
install_into "$WR_A" "$TMP/backups-a3" >/dev/null
printf '127c4737a75b4f30bce58ca2c411847c1365db69\n' >"$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt"
if bash "$WR_A/ops/release/verify-environment-governance-bundle.sh" \
  --ops-root "$WR_A/ops" \
  --manifest "$WR_A/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json" \
  --marker "$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt" >/tmp/wr-marker-mix.out 2>&1; then
  fail "8_marker_manifest_disagree_should_fail"
else
  ok "8_marker_manifest_disagree"
fi

# 9) Mid-install forced failure restores previous distinct content
install_into "$WR_A" "$TMP/backups-a4" >/dev/null
# Make currently installed profile uniquely tagged, then fail while reinstalling clean harness.
echo "# previous-unique-$(date +%s)" >>"$WR_A/ops/lib/woodright-environment-profile.sh"
TAGGED_SHA="$(shasum -a 256 "$WR_A/ops/lib/woodright-environment-profile.sh" | awk '{print $1}')"
# Backup tagged as "previous" by starting install that fails after overwriting profile.
set +e
WOODRIGHT_INSTALL_WR_ROOT="$WR_A" \
WOODRIGHT_INSTALL_BACKUP_ROOT="$TMP/backups-forcefail" \
WOODRIGHT_INSTALL_FORCE_FAIL_AFTER="ops/lib/woodright-environment-profile.sh" \
bash "$HARNESS/ops/release/install-environment-governance.sh" \
  --source-sha "$SHA_H" --repo-root "$HARNESS" --ops-root "$WR_A/ops" \
  >/tmp/wr-forcefail.out 2>&1
RC=$?
set -e
[[ "$RC" -ne 0 ]] && ok "9_force_fail_nonzero" || fail "9_force_fail_nonzero"
grep -q "RESTORE_OK\|RESTORE_BEGIN" /tmp/wr-forcefail.out && ok "9_restore_invoked" || fail "9_restore_invoked"
RESTORED_SHA="$(shasum -a 256 "$WR_A/ops/lib/woodright-environment-profile.sh" | awk '{print $1}')"
[[ "$RESTORED_SHA" == "$TAGGED_SHA" ]] && ok "9_profile_restored_tagged" || fail "9_profile_restored_tagged have=$RESTORED_SHA want=$TAGGED_SHA"
# Marker must remain previous successful install SHA (still SHA_H) and not be cleared incorrectly
NEW_MARKER="$(tr -d '[:space:]' <"$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt")"
[[ "$NEW_MARKER" == "$SHA_H" ]] && ok "9_marker_kept" || fail "9_marker_kept have=$NEW_MARKER"

# 10) Truncated manifest refused
python3 - <<PY
import json
from pathlib import Path
p=Path("$WR_A/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json")
d=json.loads(p.read_text())
d["files"]=d["files"][:3]
p.write_text(json.dumps(d))
PY
if bash "$WR_A/ops/release/verify-environment-governance-bundle.sh" \
  --ops-root "$WR_A/ops" \
  --manifest "$WR_A/tools/release/ENV_GOVERNANCE_BUNDLE_MANIFEST.json" \
  --marker "$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt" >/tmp/wr-trunc.out 2>&1; then
  fail "10_truncated_should_fail"
else
  ok "10_truncated_manifest"
fi

echo "SUMMARY pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
