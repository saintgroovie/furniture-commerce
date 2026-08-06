#!/usr/bin/env bash
# Fidelity: EXPECTED_RELEASE SHA schema normalization + REQUIRE digest gate.
# Fixtures only — never touches live ownership state or containers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DISC="$ROOT/ops/lib/woodright-runtime-discovery.sh"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

# shellcheck source=../../ops/lib/woodright-runtime-discovery.sh
source "$DISC"

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

write_expected() {
  local path="$1"
  shift
  python3 - "$path" "$@" <<'PY'
import json,sys
path=sys.argv[1]
args=sys.argv[2:]
obj={}
i=0
while i < len(args):
  k=args[i]; v=args[i+1]; i+=2
  if v != "":
    obj[k]=v
json.dump(obj, open(path,"w"), indent=2)
print(path)
PY
}

SHA_OK=08731e01ecf6905f700e822ff8b648a52ad2d21e
SHA_OTHER=22cbd68bb40fd2dbc110e421842c58806367fcba
DIG_SF=sha256:7ac0551cc65b1b1c0685d90c00e22d173810cf0eb690795acfb32f519800977d
DIG_BE=sha256:29f90c9c4cc3be37d533077a04e590ac674b9cf6da6bb74e15849f0e1ce630be
DIG_BAD=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

# --- resolve SHA helper ---
resolve_case() {
  local name="$1" expect_rc="$2" expect_detail="$3"
  shift 3
  local f="$TMP/exp-$name.json" rc out
  write_expected "$f" "$@" >/dev/null
  set +e
  out=$(
    set +e
    wr_resolve_expected_application_source_sha "$f" 2>&1
    echo "__RC=$?__SHA=${WR_EXPECTED_APPLICATION_SOURCE_SHA:-}__"
  )
  # Parent must re-run for SHA on success (subshell loses export). Prefer direct call:
  wr_resolve_expected_application_source_sha "$f" >/dev/null 2>"$TMP/resolve-$name.err"
  rc=$?
  set -e
  out="$(cat "$TMP/resolve-$name.err" 2>/dev/null || true)"
  if [[ "$rc" -eq "$expect_rc" ]]; then
    if [[ "$expect_rc" -eq 0 ]]; then
      [[ "${WR_EXPECTED_APPLICATION_SOURCE_SHA:-}" == "$expect_detail" ]] \
        && pass "resolve $name sha=$WR_EXPECTED_APPLICATION_SOURCE_SHA" \
        || fail "resolve $name want_sha=$expect_detail got=${WR_EXPECTED_APPLICATION_SOURCE_SHA:-}"
    else
      echo "$out" | grep -q "detail=$expect_detail" \
        && pass "resolve $name fail detail=$expect_detail" \
        || fail "resolve $name want detail=$expect_detail out=$out"
    fi
  else
    fail "resolve $name rc=$rc want=$expect_rc out=$out"
  fi
}

resolve_case app_only 0 "$SHA_OK" application_source_sha "$SHA_OK"
resolve_case approved_only 0 "$SHA_OK" approved_git_sha "$SHA_OK"
resolve_case both_same 0 "$SHA_OK" application_source_sha "$SHA_OK" approved_git_sha "$SHA_OK"
resolve_case both_conflict 1 expected_git_sha_conflict application_source_sha "$SHA_OK" approved_git_sha "$SHA_OTHER"
resolve_case missing 1 expected_git_sha_missing storefront_digest "$DIG_SF"
resolve_case empty_app 1 expected_git_sha_missing application_source_sha ""
resolve_case malformed 1 expected_git_sha_malformed application_source_sha "not-a-sha"

# Unreadable EXPECTED must be permission/state, not digest drift (non-root only:
# root can still read mode 000 files via capability bypass of DAC).
if [[ "$(id -u)" -eq 0 ]]; then
  pass "resolve unreadable skipped under root (DAC bypass)"
else
  f="$TMP/exp-unreadable.json"
  write_expected "$f" application_source_sha "$SHA_OK" storefront_digest "$DIG_SF" backend_digest "$DIG_BE" >/dev/null
  chmod 000 "$f"
  set +e
  wr_resolve_expected_application_source_sha "$f" >/dev/null 2>"$TMP/resolve-unreadable.err"
  rc=$?
  set -e
  out="$(cat "$TMP/resolve-unreadable.err" 2>/dev/null || true)"
  chmod u+rw "$f" || true
  if [[ "$rc" -eq 1 ]] && echo "$out" | grep -q "EXPECTED_STATE_UNREADABLE" \
    && echo "$out" | grep -q "detail=permission_denied" \
    && ! echo "$out" | grep -q "DIGEST_MISMATCH"; then
    pass "resolve unreadable → EXPECTED_STATE_UNREADABLE permission_denied"
  else
    fail "resolve unreadable want EXPECTED_STATE_UNREADABLE permission_denied out=$out rc=$rc"
  fi
fi

# --- docker shim for validate_* ---
BIN="$TMP/bin"
mkdir -p "$BIN"
cat >"$BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cmd="${1:-}"
if [[ "$cmd" == "inspect" || "$cmd" == "image" ]]; then
  if [[ "$cmd" == "image" && "${2:-}" == "inspect" ]]; then
    shift 2
  else
    shift
  fi
  fmt=""; name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--format) fmt="$2"; shift 2 ;;
      *) name="$1"; shift; break ;;
    esac
  done
  if [[ -z "$name" ]]; then exit 1; fi
  # image inspect by digest
  if [[ "$name" == sha256:* ]]; then
    if [[ -n "${WOODRIGHT_FAKE_RESOLVE_MAP_FROM:-}" && "$name" == "$WOODRIGHT_FAKE_RESOLVE_MAP_FROM" ]]; then
      if [[ -z "$fmt" || "$fmt" == *Id* ]]; then echo "${WOODRIGHT_FAKE_RESOLVE_MAP_TO}"; fi
      exit 0
    fi
    if [[ "${WOODRIGHT_FAKE_RESOLVE_OK:-1}" == "1" && "$name" == "${WOODRIGHT_FAKE_IMG_ID:-}" ]]; then
      if [[ -z "$fmt" || "$fmt" == *Id* ]]; then echo "${WOODRIGHT_FAKE_IMG_ID}"; fi
      exit 0
    fi
    exit 1
  fi
  # container exists probe (no format)
  if [[ "${WOODRIGHT_FAKE_EXISTS:-1}" != "1" ]]; then exit 1; fi
  if [[ -z "$fmt" ]]; then
    echo "[]"; exit 0
  fi
  if [[ "$fmt" == *Running* ]]; then
    echo "${WOODRIGHT_FAKE_RUNNING:-true}"; exit 0
  fi
  if [[ "$fmt" == *Health* ]]; then
    echo "${WOODRIGHT_FAKE_HEALTH:-healthy}"; exit 0
  fi
  if [[ "$fmt" == '{{.Image}}' || "$fmt" == *'{{.Image}}'* ]]; then
    echo "${WOODRIGHT_FAKE_IMG_ID:-}"; exit 0
  fi
  if [[ "$fmt" == *deployment-owner* ]]; then echo "${WOODRIGHT_FAKE_OWNER:-Dokploy}"; exit 0; fi
  if [[ "$fmt" == *runtime-role* ]]; then echo "${WOODRIGHT_FAKE_ROLE:-}"; exit 0; fi
  if [[ "$fmt" == *revision* ]]; then echo "${WOODRIGHT_FAKE_REV:-}"; exit 0; fi
  if [[ "$fmt" == *Mounts* ]]; then echo "${WOODRIGHT_FAKE_MOUNTS_JSON:-[]}"; exit 0; fi
  echo ""; exit 0
fi
exit 0
EOF
chmod +x "$BIN/docker"

export PATH="$BIN:$PATH"
export WOODRIGHT_REQUIRE_EXPECTED_DIGEST=1
export WOODRIGHT_REQUIRE_PUBLIC_DEMO=0
export WOODRIGHT_REQUIRE_MEDIA_MOUNT=0
export WOODRIGHT_EXPECTED_RELEASE=""

validate_be() {
  local name="$1" expect_ok="$2" expect_detail="${3:-}" rc out
  set +e
  wr_validate_backend_candidate woodright-production-backend >"$TMP/be-$name.out" 2>"$TMP/be-$name.err"
  rc=$?
  set -e
  out="$(cat "$TMP/be-$name.err" 2>/dev/null || true)"
  if [[ "$expect_ok" == "1" ]]; then
    [[ "$rc" -eq 0 && "$WR_DISCOVERY_VERDICT" == "DISCOVERY_OK" ]] \
      && pass "be $name OK" || fail "be $name want OK got rc=$rc verdict=$WR_DISCOVERY_VERDICT out=$out"
  else
    [[ "$rc" -ne 0 && "$WR_DISCOVERY_VERDICT" == "DIGEST_MISMATCH" ]] || {
      fail "be $name want DIGEST_MISMATCH got $WR_DISCOVERY_VERDICT rc=$rc"; return
    }
    echo "$out" | grep -q "detail=$expect_detail" \
      && pass "be $name detail=$expect_detail" \
      || fail "be $name want detail=$expect_detail out=$out"
  fi
}

# Matching via resolved image Id (config Id ≠ manifest digest string; inspect maps digest→Id)
f="$TMP/prod-resolve.json"
write_expected "$f" application_source_sha "$SHA_OK" backend_digest "$DIG_BE" storefront_digest "$DIG_SF" >/dev/null
export WOODRIGHT_EXPECTED_RELEASE="$f"
export WOODRIGHT_FAKE_EXISTS=1 WOODRIGHT_FAKE_RUNNING=true WOODRIGHT_FAKE_HEALTH=healthy
export WOODRIGHT_FAKE_OWNER=Dokploy WOODRIGHT_FAKE_ROLE=
export WOODRIGHT_FAKE_IMG_ID="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
export WOODRIGHT_FAKE_RESOLVE_MAP_FROM="$DIG_BE"
export WOODRIGHT_FAKE_RESOLVE_MAP_TO="$WOODRIGHT_FAKE_IMG_ID"
export WOODRIGHT_FAKE_REV="$SHA_OK" WOODRIGHT_FAKE_RESOLVE_OK=1
validate_be match_resolved_id 1
unset WOODRIGHT_FAKE_RESOLVE_MAP_FROM WOODRIGHT_FAKE_RESOLVE_MAP_TO
export WOODRIGHT_FAKE_IMG_ID="$DIG_BE"

# Matching: application_source_sha only
f="$TMP/prod-app.json"
write_expected "$f" application_source_sha "$SHA_OK" backend_digest "$DIG_BE" storefront_digest "$DIG_SF" >/dev/null
export WOODRIGHT_EXPECTED_RELEASE="$f"
export WOODRIGHT_FAKE_IMG_ID="$DIG_BE" WOODRIGHT_FAKE_REV="$SHA_OK" WOODRIGHT_FAKE_RESOLVE_OK=1
validate_be match_app_only 1

# Matching: approved_git_sha only
f="$TMP/prod-approved.json"
write_expected "$f" approved_git_sha "$SHA_OK" backend_digest "$DIG_BE" storefront_digest "$DIG_SF" >/dev/null
export WOODRIGHT_EXPECTED_RELEASE="$f"
validate_be match_approved_only 1

# Matching: both same
f="$TMP/prod-both.json"
write_expected "$f" application_source_sha "$SHA_OK" approved_git_sha "$SHA_OK" backend_digest "$DIG_BE" storefront_digest "$DIG_SF" >/dev/null
export WOODRIGHT_EXPECTED_RELEASE="$f"
validate_be match_both 1

# Conflict keys
f="$TMP/prod-conflict.json"
write_expected "$f" application_source_sha "$SHA_OK" approved_git_sha "$SHA_OTHER" backend_digest "$DIG_BE" storefront_digest "$DIG_SF" >/dev/null
export WOODRIGHT_EXPECTED_RELEASE="$f"
validate_be conflict 0 expected_git_sha_conflict

# Missing SHA
f="$TMP/prod-nosha.json"
write_expected "$f" backend_digest "$DIG_BE" storefront_digest "$DIG_SF" >/dev/null
export WOODRIGHT_EXPECTED_RELEASE="$f"
validate_be nosha 0 expected_git_sha_missing

# Wrong backend digest
f="$TMP/prod-baddig.json"
write_expected "$f" application_source_sha "$SHA_OK" backend_digest "$DIG_BAD" storefront_digest "$DIG_SF" >/dev/null
export WOODRIGHT_EXPECTED_RELEASE="$f"
export WOODRIGHT_FAKE_RESOLVE_OK=0
validate_be baddig 0 backend_digest_mismatch
export WOODRIGHT_FAKE_RESOLVE_OK=1

# Wrong revision
f="$TMP/prod-badrev.json"
write_expected "$f" application_source_sha "$SHA_OK" backend_digest "$DIG_BE" storefront_digest "$DIG_SF" >/dev/null
export WOODRIGHT_EXPECTED_RELEASE="$f"
export WOODRIGHT_FAKE_REV="$SHA_OTHER"
validate_be badrev 0 backend_revision_mismatch
export WOODRIGHT_FAKE_REV="$SHA_OK"

# Storefront validate match + mismatch
validate_sf() {
  local name="$1" expect_ok="$2" expect_detail="${3:-}" rc out
  set +e
  wr_validate_storefront_candidate woodright-production-storefront >"$TMP/sf-$name.out" 2>"$TMP/sf-$name.err"
  rc=$?
  set -e
  out="$(cat "$TMP/sf-$name.err" 2>/dev/null || true)"
  if [[ "$expect_ok" == "1" ]]; then
    [[ "$rc" -eq 0 && "$WR_DISCOVERY_VERDICT" == "DISCOVERY_OK" ]] \
      && pass "sf $name OK" || fail "sf $name want OK got $WR_DISCOVERY_VERDICT out=$out"
  else
    echo "$out" | grep -q "detail=$expect_detail" \
      && pass "sf $name detail=$expect_detail" \
      || fail "sf $name want $expect_detail out=$out"
  fi
}
export WOODRIGHT_FAKE_IMG_ID="$DIG_SF" WOODRIGHT_FAKE_REV="$SHA_OK"
f="$TMP/prod-app.json"
export WOODRIGHT_EXPECTED_RELEASE="$f"
validate_sf match 1
export WOODRIGHT_FAKE_IMG_ID="$DIG_BAD" WOODRIGHT_FAKE_RESOLVE_OK=0
validate_sf baddig 0 storefront_digest_mismatch
export WOODRIGHT_FAKE_IMG_ID="$DIG_SF" WOODRIGHT_FAKE_RESOLVE_OK=1 WOODRIGHT_FAKE_REV="$SHA_OTHER"
validate_sf badrev 0 storefront_revision_mismatch

# Exited keeper not accepted
export WOODRIGHT_FAKE_RUNNING=false WOODRIGHT_FAKE_REV="$SHA_OK" WOODRIGHT_REQUIRE_EXPECTED_DIGEST=1
set +e
wr_validate_backend_candidate woodright-production-backend-keeper >"$TMP/keeper.out" 2>"$TMP/keeper.err"
set -e
[[ "$WR_DISCOVERY_VERDICT" == "NAME_EXCLUDED" ]] && pass "keeper name excluded" || fail "keeper verdict=$WR_DISCOVERY_VERDICT err=$(cat "$TMP/keeper.err")"

# REQUIRE=0 skips digest (discovery-only / unenforced)
export WOODRIGHT_REQUIRE_EXPECTED_DIGEST=0
export WOODRIGHT_FAKE_RUNNING=true WOODRIGHT_FAKE_IMG_ID="$DIG_BAD"
f="$TMP/prod-conflict.json"
export WOODRIGHT_EXPECTED_RELEASE="$f"
set +e
wr_validate_backend_candidate woodright-production-backend >"$TMP/req0.out" 2>"$TMP/req0.err"
rc=$?
set -e
[[ "$rc" -eq 0 && "$WR_DISCOVERY_VERDICT" == "DISCOVERY_OK" ]] \
  && pass "REQUIRE=0 skips digest (unenforced; not fidelity proof)" \
  || fail "REQUIRE=0 should skip digest gate verdict=$WR_DISCOVERY_VERDICT"

# Default for production profile file
grep -q '^WOODRIGHT_REQUIRE_EXPECTED_DIGEST=1$' "$ROOT/ops/config/runtime-environments/production.conf" \
  && pass "production.conf REQUIRE=1" || fail "production.conf missing REQUIRE=1"
grep -q 'WOODRIGHT_REQUIRE_EXPECTED_DIGEST=1' \
  "$ROOT/ops/systemd/woodright-monitor-production-candidate.service.d/digest-authority.conf" \
  && pass "canonical drop-in REQUIRE=1" || fail "drop-in missing REQUIRE=1"
! grep -q 'WOODRIGHT_REQUIRE_EXPECTED_DIGEST=0' \
  "$ROOT/ops/systemd/woodright-monitor-production-candidate.service.d/"*.conf \
  && pass "no REQUIRE=0 in canonical drop-ins" || fail "REQUIRE=0 still in drop-ins"

# Secret scan of discovery helper
if grep -nEi 'password=|DATABASE_URL|postgresql://' "$DISC" >/dev/null; then
  fail "secret-like strings in discovery"
else
  pass "no secret-like strings in discovery"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "RESULT: FAIL count=$FAIL"
  exit 1
fi
echo "RESULT: PASS"
exit 0
