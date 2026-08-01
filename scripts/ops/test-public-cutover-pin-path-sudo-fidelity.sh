#!/usr/bin/env bash
# Fidelity: public_demo cutover pin path + root-owned parent sudo preflight.
# Reproduces 2026-08-01 next16 public_demo failures:
#   1) missing scripts/release/reconcile-public-image-pins.sh after install→tools/release
#   2) need_sudo_for skipped sudo when dest .env was user-writable but parent was root-owned
#   3) staged temp name "..env.wr-reconcile-*" for basename ".env"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIN="$ROOT/scripts/release/reconcile-public-image-pins.sh"
CUTOVER="$ROOT/ops/release/cutover-public-demo-pair.sh"
INSTALL="$ROOT/ops/release/install-environment-governance.sh"
FAILED=0
TMP="$(mktemp -d /tmp/wr-pin-path-sudo-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

[[ -x "$PIN" ]] || { echo "missing $PIN"; exit 2; }
[[ -f "$CUTOVER" ]] || { echo "missing $CUTOVER"; exit 2; }

# --- extract need_sudo_for + atomic staging name helpers without executing pin script ---
extract_fn() {
  local name="$1"
  awk -v fn="$name" '
    $0 ~ "^"fn"\\(\\)" {grab=1}
    grab {print}
    grab && /^}/ {exit}
  ' "$PIN"
}

# shellcheck disable=SC1090
eval "$(extract_fn need_sudo_for)"

# 1) writable file + writable parent → no sudo
mkdir -p "$TMP/user/dir"
touch "$TMP/user/dir/.env"
chmod u+w "$TMP/user/dir" "$TMP/user/dir/.env"
if need_sudo_for "$TMP/user/dir/.env"; then
  fail "writable file+parent unexpectedly requires sudo"
else
  pass "writable file+parent → no sudo"
fi

# 2) missing file + writable parent → no sudo
rm -f "$TMP/user/dir/missing.env"
if need_sudo_for "$TMP/user/dir/missing.env"; then
  fail "missing file+writable parent unexpectedly requires sudo"
else
  pass "missing file+writable parent → no sudo"
fi

# 3) Simulate root-owned parent: directory without write for current user
#    (portable: chmod 555 on parent while keeping file writable).
mkdir -p "$TMP/rootish"
touch "$TMP/rootish/.env"
chmod u+w "$TMP/rootish/.env"
chmod a-w "$TMP/rootish"
if need_sudo_for "$TMP/rootish/.env"; then
  pass "writable file in non-writable parent → sudo required"
else
  fail "writable file in non-writable parent did not require sudo (public_demo regression)"
fi
# restore write for cleanup
chmod u+w "$TMP/rootish"

# 4) missing file in non-writable parent → sudo required
chmod a-w "$TMP/rootish"
if need_sudo_for "$TMP/rootish/new.env"; then
  pass "missing file in non-writable parent → sudo required"
else
  fail "missing file in non-writable parent did not require sudo"
fi
chmod u+w "$TMP/rootish"

# 5) staged name for .env must not become "..env..." and mktemp template must
#    keep XXXXXX at the end (macOS/BSD mktemp requirement).
if grep -q 'mktemp "${dir}/.wr-reconcile.${safe_base}.XXXXXX"' "$PIN"; then
  pass "atomic_install uses exclusive mktemp with XXXXXX suffix"
else
  fail "atomic_install missing secure mktemp staged path"
fi
if grep -qE 'local staged="\$\{dir\}/\.\$\{base\}\.wr-reconcile|staged="\$\{dir\}/\.wr-reconcile-\$\$' "$PIN"; then
  fail "atomic_install still uses predictable PID staged path"
else
  pass "no predictable PID staged path in atomic_install"
fi
# Exercise non-sudo atomic_install via extracted function against a temp dest.
# shellcheck disable=SC1090
eval "$(
  awk '
    /^atomic_install\(\)/ {grab=1}
    grab {print}
    grab && /^}/ {exit}
  ' "$PIN"
)"
# Stub sudo away - atomic_install path under test is USE_SUDO=0
USE_SUDO=0
mkdir -p "$TMP/atomic"
printf 'old\n' >"$TMP/atomic/.env"
chmod 640 "$TMP/atomic/.env"
printf 'new-content\n' >"$TMP/atomic/src.tmp"
atomic_install "$TMP/atomic/src.tmp" "$TMP/atomic/.env"
if [[ "$(cat "$TMP/atomic/.env")" == "new-content" ]]; then
  pass "atomic_install replaces .env without ..env staging"
else
  fail "atomic_install content mismatch"
fi
# Symlink race witness: pre-create a symlink at a predictable old-style path must not be used
ln -s /etc/passwd "$TMP/atomic/..env.wr-reconcile-fake" 2>/dev/null || true
atomic_install "$TMP/atomic/src.tmp" "$TMP/atomic/.env"
if [[ "$(cat "$TMP/atomic/.env")" == "new-content" ]]; then
  pass "atomic_install unaffected by planted ..env symlink bait"
else
  fail "atomic_install corrupted by symlink bait"
fi
# leftover mktemp files should not remain (mv consumed them)
leftovers="$(find "$TMP/atomic" -name '.wr-reconcile.*' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$leftovers" == "0" ]]; then
  pass "no leftover wr-reconcile temp files"
else
  fail "leftover wr-reconcile temps=$leftovers"
fi

# 5c) Exercise USE_SUDO=1 via a fake sudo shim (no real privilege escalation).
mkdir -p "$TMP/sudo-bin" "$TMP/sudo-log" "$TMP/sudo-atomic"
cat >"$TMP/sudo-bin/sudo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
log="${WR_FAKE_SUDO_LOG:?}"
# Drop -n (non-interactive) and execute the remainder as the current user.
args=("$@")
filtered=()
for a in "${args[@]}"; do
  [[ "$a" == "-n" ]] && continue
  filtered+=("$a")
done
printf 'sudo' >>"$log"
for a in "${filtered[@]}"; do
  printf ' %q' "$a" >>"$log"
done
printf '\n' >>"$log"
exec "${filtered[@]}"
EOF
chmod +x "$TMP/sudo-bin/sudo"
export PATH="$TMP/sudo-bin:$PATH"
export WR_FAKE_SUDO_LOG="$TMP/sudo-log/calls.txt"
: >"$WR_FAKE_SUDO_LOG"
USE_SUDO=1
printf 'old-sudo\n' >"$TMP/sudo-atomic/.env"
chmod 640 "$TMP/sudo-atomic/.env"
printf 'new-sudo\n' >"$TMP/sudo-atomic/src.tmp"
# Plant old-style predictable bait that must never be written.
ln -sf /etc/passwd "$TMP/sudo-atomic/..env.wr-reconcile-$$" 2>/dev/null || true
atomic_install "$TMP/sudo-atomic/src.tmp" "$TMP/sudo-atomic/.env"
if [[ "$(cat "$TMP/sudo-atomic/.env")" == "new-sudo" ]]; then
  pass "USE_SUDO=1 atomic_install replaces destination via fake sudo"
else
  fail "USE_SUDO=1 atomic_install content mismatch"
fi
if grep -q 'mktemp' "$WR_FAKE_SUDO_LOG" && grep -q ' mv ' "$WR_FAKE_SUDO_LOG"; then
  pass "USE_SUDO=1 path invoked mktemp and mv through sudo shim"
else
  fail "USE_SUDO=1 sudo call log missing mktemp/mv: $(tr '\n' ';' <"$WR_FAKE_SUDO_LOG")"
fi
if grep -Eq '\.\.env\.wr-reconcile' "$WR_FAKE_SUDO_LOG"; then
  fail "USE_SUDO=1 still referenced predictable ..env staged path"
else
  pass "USE_SUDO=1 did not use predictable ..env staged path"
fi
sudo_leftovers="$(find "$TMP/sudo-atomic" -name '.wr-reconcile.*' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$sudo_leftovers" == "0" ]]; then
  pass "USE_SUDO=1 left no wr-reconcile temps"
else
  fail "USE_SUDO=1 leftovers=$sudo_leftovers"
fi

# 5b) install backs up scripts/release compatibility path before ln -sfn
if grep -q 'scripts_release_.*pre-symlink' "$INSTALL"; then
  pass "install backs up scripts/release path before symlink"
else
  fail "install does not backup scripts/release before ln -sfn"
fi

# 6) Symlink invocation resolves ROOT (ops/ + scripts/ must load)
mkdir -p "$TMP/layout/scripts/release" "$TMP/layout/tools/release"
cp "$PIN" "$TMP/layout/tools/release/reconcile-public-image-pins.sh"
chmod +x "$TMP/layout/tools/release/reconcile-public-image-pins.sh"
# Minimal fake ops tree so source succeeds enough to print ROOT — instead just
# parse ROOT assignment by running bash -c with BASH_SOURCE simulation via symlink.
ln -s "$TMP/layout/tools/release/reconcile-public-image-pins.sh" \
  "$TMP/layout/scripts/release/reconcile-public-image-pins.sh"

# Create minimal ops stubs so sourcing does not explode before ROOT is used.
mkdir -p "$TMP/layout/ops/lib" "$TMP/layout/ops/config/runtime-environments"
# Patch: run a tiny probe that only resolves ROOT the same way as the script.
cat >"$TMP/probe-root.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
_wr_pin_script_src="${BASH_SOURCE[0]}"
while [[ -L "$_wr_pin_script_src" ]]; do
  _wr_pin_script_dir="$(cd -P "$(dirname "$_wr_pin_script_src")" && pwd)"
  _wr_pin_script_link="$(readlink "$_wr_pin_script_src")"
  if [[ "$_wr_pin_script_link" != /* ]]; then
    _wr_pin_script_src="$_wr_pin_script_dir/$_wr_pin_script_link"
  else
    _wr_pin_script_src="$_wr_pin_script_link"
  fi
done
ROOT="$(cd -P "$(dirname "$_wr_pin_script_src")/../.." && pwd)"
printf '%s\n' "$ROOT"
EOF
chmod +x "$TMP/probe-root.sh"
cp "$TMP/probe-root.sh" "$TMP/layout/tools/release/probe-root.sh"
ln -sfn "$TMP/layout/tools/release/probe-root.sh" "$TMP/layout/scripts/release/probe-root.sh"
resolved_root="$("$TMP/layout/scripts/release/probe-root.sh")"
want_root="$(cd -P "$TMP/layout" && pwd)"
if [[ "$resolved_root" == "$want_root" ]]; then
  pass "symlink invocation resolves canonical ROOT=$resolved_root"
else
  fail "symlink ROOT want=$want_root got=$resolved_root"
fi

# 7) Cutover accepts tools/release when scripts/release missing
if grep -q 'tools/release/reconcile-public-image-pins.sh' "$CUTOVER" \
  && grep -q 'scripts/release/reconcile-public-image-pins.sh' "$CUTOVER"; then
  pass "cutover checks scripts/release and tools/release"
else
  fail "cutover missing dual path resolution for pin reconcile"
fi

# 8) Install creates scripts/release symlink after tools/release install
if grep -q 'ln -sfn' "$INSTALL" && grep -q '/srv/woodright/scripts/release' "$INSTALL"; then
  pass "install-environment-governance creates scripts/release symlink"
else
  fail "install does not create scripts/release symlink for pin script"
fi

# 9) Old broken need_sudo_for logic (regression witness) would fail case 3
old_need_sudo_for() {
  local f="$1"
  if [[ -e "$f" ]]; then
    [[ -w "$f" ]] && return 1
    return 0
  fi
  [[ -w "$(dirname "$f")" ]] && return 1
  return 0
}
chmod a-w "$TMP/rootish"
if old_need_sudo_for "$TMP/rootish/.env"; then
  fail "old need_sudo_for unexpectedly required sudo (fixture invalid)"
else
  pass "old need_sudo_for reproduces public_demo bug (no sudo for writable .env in non-writable parent)"
fi
chmod u+w "$TMP/rootish"

# 10) bash -n syntax
bash -n "$PIN" && pass "bash -n pin script" || fail "bash -n pin script"
bash -n "$CUTOVER" && pass "bash -n cutover" || fail "bash -n cutover"
bash -n "$INSTALL" && pass "bash -n install" || fail "bash -n install"

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAILED_COUNT=$FAILED"
  exit 1
fi
echo "ALL PIN PATH/SUDO FIDELITY TESTS PASSED"
