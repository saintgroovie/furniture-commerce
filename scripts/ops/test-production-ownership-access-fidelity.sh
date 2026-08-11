#!/usr/bin/env bash
# Unit fidelity: production ownership access contract helper.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../../ops/lib/woodright-production-ownership-access.sh
source "$ROOT/ops/lib/woodright-production-ownership-access.sh"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "PASS: $*"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $*"; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/wr-own-access.XXXXXX")"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

ME="$(id -un)"
MG="$(id -gn)"

# --- defaults ---
unset WOODRIGHT_PRODUCTION_OWNERSHIP_OWNER WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP WOODRIGHT_PRODUCTION_OWNERSHIP_MODE || true
wr_prod_ownership_access_defaults
[[ "$WOODRIGHT_PRODUCTION_OWNERSHIP_OWNER" == "root" ]] && pass "default owner root" || fail "default owner"
[[ "$WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP" == "woodright-ops" ]] && pass "default group woodright-ops" || fail "default group"
[[ "$WOODRIGHT_PRODUCTION_OWNERSHIP_MODE" == "0640" ]] && pass "default mode 0640" || fail "default mode"

# --- mode gate ---
wr_prod_ownership_mode_ok 0640 && pass "mode 0640 accepted" || fail "mode 0640"
if wr_prod_ownership_mode_ok 0600; then fail "mode 0600 must be refused"; else pass "mode 0600 refused"; fi
if wr_prod_ownership_mode_ok 0644; then fail "mode 0644 must be refused"; else pass "mode 0644 refused"; fi
if wr_prod_ownership_mode_ok 0777; then fail "mode 0777 must be refused"; else pass "mode 0777 refused"; fi

# --- missing group fails closed ---
export WOODRIGHT_PRODUCTION_OWNERSHIP_OWNER="$ME"
export WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP="woodright-ops-missing-$$"
export WOODRIGHT_PRODUCTION_OWNERSHIP_MODE=0640
f="$TMP/EXPECTED_RELEASE.json"
printf '{"schema":"test"}\n' >"$f"
chmod 0600 "$f"
if wr_prod_ownership_apply_access "$f" 2>"$TMP/missing.err"; then
  fail "missing group should fail closed"
else
  pass "missing group fails closed"
  grep -qi 'group missing\|required ownership group' "$TMP/missing.err" \
    && pass "missing group error mentions group" || fail "missing group error text"
fi

# --- apply with real current user/group ---
export WOODRIGHT_PRODUCTION_OWNERSHIP_GROUP="$MG"
printf '{"schema":"test","application_source_sha":"abc"}\n' >"$f"
chmod 0600 "$f"
wr_prod_ownership_apply_access "$f" && pass "apply succeeds for harness owner/group" || fail "apply harness"
python3 - "$f" "$ME" "$MG" <<'PY' && pass "verify owner/group/mode after apply" || fail "verify after apply"
import os, stat, pwd, grp, sys
path, want_u, want_g = sys.argv[1:4]
st = os.stat(path)
mode = stat.S_IMODE(st.st_mode)
assert mode == 0o640, oct(mode)
assert (mode & 0o007) == 0
assert pwd.getpwuid(st.st_uid).pw_name == want_u
assert grp.getgrgid(st.st_gid).gr_name == want_g
# group write must be absent
assert (mode & 0o020) == 0
print("ok")
PY

# operator-as-group-member can read; world cannot rely on other bits
[[ -r "$f" ]] && pass "owner can read" || fail "owner read"
# simulate other-user unreadability via mode bits only
python3 - "$f" <<'PY' && pass "no world read bit" || fail "world read bit"
import os, stat, sys
st = os.stat(sys.argv[1])
assert (stat.S_IMODE(st.st_mode) & 0o004) == 0
print("ok")
PY

echo "SUMMARY pass=$PASS fail=$FAIL"
[[ "$FAIL" -eq 0 ]]
