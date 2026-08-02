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
LATER="$WR_A/ops/release/cutover-public-demo-pair.sh"
LATER_SHA="$(shasum -a 256 "$LATER" | awk '{print $1}')"
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
NEW_MARKER="$(tr -d '[:space:]' <"$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt")"
[[ "$NEW_MARKER" == "$SHA_H" ]] && ok "9_marker_kept" || fail "9_marker_kept have=$NEW_MARKER"
[[ -f "$LATER" ]] && ok "9_later_file_exists" || fail "9_later_file_exists"
LATER_AFTER="$(shasum -a 256 "$LATER" | awk '{print $1}')"
[[ "$LATER_AFTER" == "$LATER_SHA" ]] && ok "9_later_file_untouched" || fail "9_later_file_untouched"

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

# 11) Concurrent install refused while install lock held
install_into "$WR_A" "$TMP/backups-a5" >/dev/null
LOCK_A="$WR_A/locks/env-governance-install.lock"
mkdir -p "$(dirname "$LOCK_A")"
: >>"$LOCK_A"
python3 - "$LOCK_A" <<'PY' &
import fcntl, os, sys, time
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT, 0o644)
fcntl.flock(fd, fcntl.LOCK_EX)
time.sleep(20)
PY
HOLDER_PID=$!
sleep 0.3
set +e
WOODRIGHT_INSTALL_WR_ROOT="$WR_A" \
WOODRIGHT_INSTALL_BACKUP_ROOT="$TMP/backups-concurrent" \
bash "$HARNESS/ops/release/install-environment-governance.sh" \
  --source-sha "$SHA_H" --repo-root "$HARNESS" --ops-root "$WR_A/ops" \
  >/tmp/wr-concurrent.out 2>&1
CONC_RC=$?
set -e
kill "$HOLDER_PID" 2>/dev/null || true
wait "$HOLDER_PID" 2>/dev/null || true
[[ "$CONC_RC" -ne 0 ]] && ok "11_concurrent_install_refused" || fail "11_concurrent_install_refused"
grep -qi 'install lock busy\|concurrent install' /tmp/wr-concurrent.out && ok "11_concurrent_message" || fail "11_concurrent_message"

# 12) SIGTERM mid-install restores previous bundle
install_into "$WR_A" "$TMP/backups-a6" >/dev/null
echo "# pre-term-tag-$(date +%s)" >>"$WR_A/ops/lib/woodright-environment-profile.sh"
PRE_TERM_SHA="$(shasum -a 256 "$WR_A/ops/lib/woodright-environment-profile.sh" | awk '{print $1}')"
PRE_TERM_MARKER="$(tr -d '[:space:]' <"$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt")"
set +e
WOODRIGHT_INSTALL_WR_ROOT="$WR_A" \
WOODRIGHT_INSTALL_BACKUP_ROOT="$TMP/backups-term" \
WOODRIGHT_INSTALL_SLEEP_AFTER="ops/lib/woodright-environment-profile.sh" \
WOODRIGHT_INSTALL_SLEEP_SEC=60 \
bash "$HARNESS/ops/release/install-environment-governance.sh" \
  --source-sha "$SHA_H" --repo-root "$HARNESS" --ops-root "$WR_A/ops" \
  >/tmp/wr-term.out 2>&1 &
TERM_PID=$!
# Wait until sleep window begins (profile already written).
for _ in $(seq 1 50); do
  if grep -q 'install ops/lib/woodright-environment-profile.sh' /tmp/wr-term.out 2>/dev/null; then
    break
  fi
  sleep 0.2
done
kill -TERM "$TERM_PID" 2>/dev/null || true
wait "$TERM_PID" 2>/dev/null
TERM_RC=$?
set -e
[[ "$TERM_RC" -ne 0 ]] && ok "12_term_nonzero" || fail "12_term_nonzero"
grep -q 'INSTALL_INTERRUPTED\|RESTORE_OK\|RESTORE_BEGIN' /tmp/wr-term.out && ok "12_term_restore_logged" || fail "12_term_restore_logged"
POST_TERM_SHA="$(shasum -a 256 "$WR_A/ops/lib/woodright-environment-profile.sh" | awk '{print $1}')"
[[ "$POST_TERM_SHA" == "$PRE_TERM_SHA" ]] && ok "12_term_profile_restored" || fail "12_term_profile_restored have=$POST_TERM_SHA"
POST_TERM_MARKER="$(tr -d '[:space:]' <"$WR_A/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt")"
[[ "$POST_TERM_MARKER" == "$PRE_TERM_MARKER" ]] && ok "12_term_marker_unchanged" || fail "12_term_marker_unchanged"

# 13) Active cutover lock refuses install
mkdir -p "$WR_A/locks/public_demo"
: >>"$WR_A/locks/public_demo/live-cutover.lock"
python3 - "$WR_A/locks/public_demo/live-cutover.lock" <<'PY' &
import fcntl, os, sys, time
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT, 0o644)
fcntl.flock(fd, fcntl.LOCK_EX)
time.sleep(15)
PY
CUT_PID=$!
sleep 0.3
set +e
WOODRIGHT_INSTALL_WR_ROOT="$WR_A" \
WOODRIGHT_INSTALL_BACKUP_ROOT="$TMP/backups-cutlock" \
bash "$HARNESS/ops/release/install-environment-governance.sh" \
  --source-sha "$SHA_H" --repo-root "$HARNESS" --ops-root "$WR_A/ops" \
  >/tmp/wr-cutlock.out 2>&1
CUT_RC=$?
set -e
kill "$CUT_PID" 2>/dev/null || true
wait "$CUT_PID" 2>/dev/null || true
[[ "$CUT_RC" -ne 0 ]] && ok "13_cutover_lock_refused" || fail "13_cutover_lock_refused"
grep -qi 'runtime mutation lock held' /tmp/wr-cutlock.out && ok "13_cutover_lock_message" || fail "13_cutover_lock_message"

echo "SUMMARY pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
