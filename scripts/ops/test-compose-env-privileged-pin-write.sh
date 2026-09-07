#!/usr/bin/env bash
# Fidelity: privileged pin-write / query / duplicate-check against a
# chmod-000 candidate compose .env. Fake sudo models root-only access.
# Never requires host root. Never prints secret sentinels.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$ROOT/ops/lib/woodright-compose-env-authority.sh"
SENTINEL="THIS_MUST_NEVER_APPEAR_IN_OUTPUT"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

# shellcheck source=../../ops/lib/woodright-compose-env-authority.sh
source "$LIB"

TMP_RAW="$(mktemp -d /tmp/wr-compose-env-pin-XXXXXX)" || exit 1
TMP="$(cd "$TMP_RAW" && pwd -P)" || exit 1
case "$TMP" in
  /tmp/wr-compose-env-pin-*|/private/tmp/wr-compose-env-pin-*) ;;
  *) echo "refusing unexpected tmp dir: $TMP" >&2; exit 1 ;;
esac
cleanup() {
  case "$TMP" in
    /tmp/wr-compose-env-pin-*|/private/tmp/wr-compose-env-pin-*) ;;
    *) echo "refusing cleanup of $TMP" >&2; return 1 ;;
  esac
  find "$TMP" -name '.env' -exec chmod u+rw {} + 2>/dev/null || true
  find "$TMP" -name '.wr-prod-pin-*' -exec chmod u+rw {} + 2>/dev/null || true
  if [[ "$FAILED" -eq 0 ]]; then rm -rf "$TMP"
  else echo "harness kept: $TMP"; fi
}
trap cleanup EXIT

COMPOSE_PARENT="$TMP/etc/dokploy/compose/woodright-production"
ENV_DIR="$COMPOSE_PARENT/code"
ENV_FILE="$ENV_DIR/.env"
PUBLIC_PARENT="$TMP/etc/dokploy/compose/woodright-public-production"
PUBLIC_ENV="$PUBLIC_PARENT/code/.env"
BIN="$TMP/bin"
FAILBIN="$TMP/failbin"
mkdir -p "$ENV_DIR" "$PUBLIC_PARENT/code" "$BIN" "$FAILBIN"

OLD_BE="ghcr.io/saintgroovie/woodright-backend@sha256:$(printf 'c%.0s' {1..64})"
NEW_BE="ghcr.io/saintgroovie/woodright-backend@sha256:$(printf 'a%.0s' {1..64})"
OLD_SF="ghcr.io/saintgroovie/woodright-storefront@sha256:$(printf 'd%.0s' {1..64})"
NEW_SF="ghcr.io/saintgroovie/woodright-storefront@sha256:$(printf 'b%.0s' {1..64})"
OLD_SHA="caf82b048b9caefae30679342aec3d4fc42a8d89"
NEW_SHA="e76038bbf4b8c193dcc85f55910dde92429b382a"

write_env() {
  cat >"$ENV_FILE" <<EOF
WOODRIGHT_BACKEND_IMAGE=${OLD_BE}
WOODRIGHT_STOREFRONT_IMAGE=${OLD_SF}
WOODRIGHT_RELEASE_SHA=${OLD_SHA}
WOODRIGHT_BACKEND_SOURCE_SHA=${OLD_SHA}
WOODRIGHT_STOREFRONT_SOURCE_SHA=${OLD_SHA}
SECRET=${SENTINEL}
UNRELATED_KEY=keep-me
EOF
}

digest_of() {
  local path="$1"
  chmod u+r "$path" 2>/dev/null || true
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  else
    sha256sum -- "$path" | awk '{print $1}'
  fi
}

assert_no_sentinel() {
  local label="$1"
  shift
  if printf '%s\n' "$@" | grep -F -q "$SENTINEL"; then
    fail "$label: sentinel leaked"
  else
    pass "$label: sentinel absent"
  fi
}

install_priv_sudo() {
  local dest="$1"
  mkdir -p "$dest"
  cat >"$dest/sudo" <<EOF
#!/usr/bin/env bash
set -euo pipefail
ENV_FILE=$(printf '%q' "$ENV_FILE")
COMPOSE_DIR=$(printf '%q' "$ENV_DIR")
lock_denied() {
  chmod 000 "\$ENV_FILE" 2>/dev/null || true
}
unlock_env() { chmod u+rw "\$ENV_FILE" 2>/dev/null || true; }
if [[ "\${1:-}" != "-n" ]]; then
  echo "unexpected sudo (want -n): \$*" >&2
  exit 1
fi
shift
cmd="\${1:-}"
shift || true
case "\$cmd" in
  sha256sum)
    if [[ "\${1:-}" == "--" ]]; then shift; fi
    unlock_env
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum -- "\$1"
    else
      shasum -a 256 -- "\$1"
    fi
    rc=\$?
    lock_denied
    exit \$rc
    ;;
  python3)
    unlock_env
    set +e
    python3 "\$@"
    rc=\$?
    set -e
    lock_denied
    exit \$rc
    ;;
  cp)
    unlock_env
    set +e
    command cp "\$@"
    rc=\$?
    set -e
    lock_denied
    exit \$rc
    ;;
  mv)
    unlock_env
    set +e
    command mv "\$@"
    rc=\$?
    set -e
    lock_denied
    exit \$rc
    ;;
  chmod)
    command chmod "\$@"
    rc=\$?
    lock_denied
    exit \$rc
    ;;
  chown)
    command chown "\$@"
    rc=\$?
    lock_denied
    exit \$rc
    ;;
  rm)
    command rm "\$@"
    rc=\$?
    lock_denied
    exit \$rc
    ;;
  *)
    echo "unexpected sudo command: \$cmd \$*" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "$dest/sudo"
}

write_env
ORIG_HASH="$(digest_of "$ENV_FILE")"
install_priv_sudo "$BIN"
export PATH="$BIN:$PATH"

chmod 000 "$ENV_FILE"
if [[ -r "$ENV_FILE" ]]; then
  fail "DIRECT_READ_DENIED: file still readable"
else
  pass "DIRECT_READ_DENIED=true"
fi

# Duplicate check via privileged python
ERR="$TMP/err-dup.txt"
set +e
wr_compose_env_assert_no_duplicate_governed_keys "$ENV_FILE" >"$TMP/out-dup.txt" 2>"$ERR"
RC=$?
set -e
[[ "$RC" -eq 0 ]] && pass "privileged duplicate check PASS" || fail "privileged duplicate check rc=$RC $(cat "$ERR")"
assert_no_sentinel "duplicate-check stdout/stderr" "$(cat "$TMP/out-dup.txt" "$ERR")"

# Query governed pin
set +e
GOT="$(wr_compose_env_query_governed_value "$ENV_FILE" WOODRIGHT_BACKEND_IMAGE 2>"$TMP/err-q.txt")"
RC=$?
set -e
[[ "$RC" -eq 0 && "$GOT" == "$OLD_BE" ]] && pass "privileged query backend pin" \
  || fail "privileged query rc=$RC got=$GOT"
assert_no_sentinel "query stderr" "$(cat "$TMP/err-q.txt")"

# Non-governed key refused
set +e
wr_compose_env_query_governed_value "$ENV_FILE" SECRET >/dev/null 2>"$TMP/err-secret.txt"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "non-governed query refused" || fail "non-governed query unexpectedly ok"
assert_no_sentinel "non-governed query" "$(cat "$TMP/err-secret.txt")"

set +e
wr_compose_env_stage_rendered_pins "$ENV_FILE" "$COMPOSE_PARENT" \
  SECRET "$SENTINEL" >/dev/null 2>"$TMP/err-stage-secret.txt"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "non-governed stage refused" || fail "non-governed stage unexpectedly ok"
assert_no_sentinel "non-governed stage" "$(cat "$TMP/err-stage-secret.txt")"

# Stage + validate pin write
ERR="$TMP/err-stage.txt"
set +e
TMPFILE="$(wr_compose_env_stage_rendered_pins "$ENV_FILE" "$COMPOSE_PARENT" \
  WOODRIGHT_BACKEND_IMAGE "$NEW_BE" \
  WOODRIGHT_STOREFRONT_IMAGE "$NEW_SF" \
  WOODRIGHT_RELEASE_SHA "$NEW_SHA" \
  WOODRIGHT_BACKEND_SOURCE_SHA "$NEW_SHA" \
  WOODRIGHT_STOREFRONT_SOURCE_SHA "$NEW_SHA" 2>"$ERR")"
RC=$?
set -e
[[ "$RC" -eq 0 && -n "$TMPFILE" ]] && pass "privileged pin staging" || fail "stage rc=$RC err=$(cat "$ERR")"
assert_no_sentinel "stage stderr" "$(cat "$ERR")"

set +e
wr_compose_env_validate_keys "$TMPFILE" \
  WOODRIGHT_BACKEND_IMAGE "$NEW_BE" \
  WOODRIGHT_STOREFRONT_IMAGE "$NEW_SF" \
  WOODRIGHT_RELEASE_SHA "$NEW_SHA" >"$TMP/out-val.txt" 2>"$TMP/err-val.txt"
RC=$?
set -e
[[ "$RC" -eq 0 ]] && pass "privileged validate staged pins" || fail "validate rc=$RC $(cat "$TMP/err-val.txt")"

# Atomic install via lib (unreadable dest, writable parent → sudo cp/mv through shim)
set +e
wr_compose_env_atomic_install "$TMPFILE" "$ENV_FILE" "$COMPOSE_PARENT" 2>"$TMP/err-install.txt"
RC=$?
set -e
[[ "$RC" -eq 0 ]] && pass "privileged atomic install" || fail "atomic install rc=$RC $(cat "$TMP/err-install.txt")"
wr_compose_env_rm "$TMPFILE"
wr_compose_env_cleanup_pin_staging "$ENV_DIR"

chmod 000 "$ENV_FILE" 2>/dev/null || true
if [[ -r "$ENV_FILE" ]]; then
  fail "post-install DIRECT_READ_DENIED"
else
  pass "post-install DIRECT_READ_DENIED=true"
fi

set +e
GOT="$(wr_compose_env_query_governed_value "$ENV_FILE" WOODRIGHT_BACKEND_IMAGE 2>/dev/null)"
RC=$?
set -e
[[ "$RC" -eq 0 && "$GOT" == "$NEW_BE" ]] && pass "postcondition new backend pin" || fail "postcondition be=$GOT"
GOT="$(wr_compose_env_query_governed_value "$ENV_FILE" WOODRIGHT_RELEASE_SHA 2>/dev/null)"
[[ "$GOT" == "$NEW_SHA" ]] && pass "postcondition new release sha" || fail "postcondition sha=$GOT"
GOT="$(wr_compose_env_query_governed_value "$ENV_FILE" WOODRIGHT_STOREFRONT_IMAGE 2>/dev/null)"
[[ "$GOT" == "$NEW_SF" ]] && pass "postcondition new storefront pin" || fail "postcondition sf=$GOT"

# Unrelated key preserved (read via shim)
chmod u+r "$ENV_FILE"
if grep -qx 'UNRELATED_KEY=keep-me' "$ENV_FILE" && grep -qx "SECRET=${SENTINEL}" "$ENV_FILE"; then
  pass "unrelated keys preserved"
else
  fail "unrelated keys lost"
fi
chmod 000 "$ENV_FILE"

leftover="$(find "$ENV_DIR" -name '.wr-prod-pin-*' -o -name '.wr-prod-new-*' | wc -l | tr -d ' ')"
[[ "$leftover" == "0" ]] && pass "temp cleanup after success" || fail "leftover temps=$leftover"

# Duplicate governed key fail-closed, original restored hash via rewrite
chmod u+rw "$ENV_FILE"
write_env
printf 'WOODRIGHT_BACKEND_IMAGE=%s\n' "$OLD_BE" >>"$ENV_FILE"
DUP_HASH="$(digest_of "$ENV_FILE")"
chmod 000 "$ENV_FILE"
set +e
wr_compose_env_assert_no_duplicate_governed_keys "$ENV_FILE" >/dev/null 2>"$TMP/err-dup2.txt"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "duplicate governed key fail-closed" || fail "duplicate unexpectedly ok"
assert_no_sentinel "duplicate fail" "$(cat "$TMP/err-dup2.txt")"
chmod u+r "$ENV_FILE"
NOW="$(digest_of "$ENV_FILE")"
[[ "$NOW" == "$DUP_HASH" ]] && pass "duplicate fail: original hash unchanged" || fail "duplicate fail mutated file"
grep -q "duplicate WOODRIGHT_BACKEND_IMAGE" "$TMP/err-dup2.txt" \
  && pass "duplicate names the key" || fail "duplicate stderr missing key name"

# Public-production path refused
printf 'WOODRIGHT_BACKEND_IMAGE=x\nSECRET=%s\n' "$SENTINEL" >"$PUBLIC_ENV"
chmod 000 "$PUBLIC_ENV" 2>/dev/null || true
set +e
wr_compose_env_stage_rendered_pins "$PUBLIC_ENV" "$PUBLIC_PARENT" \
  WOODRIGHT_BACKEND_IMAGE "$NEW_BE" >/dev/null 2>"$TMP/err-pub.txt"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "public-production pin-write denied" || fail "public-production pin-write allowed"
assert_no_sentinel "public deny" "$(cat "$TMP/err-pub.txt")"

# Privileged python failure fail-closed
cat >"$FAILBIN/sudo" <<'EOF'
#!/usr/bin/env bash
echo "simulated privileged python failure" >&2
exit 42
EOF
chmod +x "$FAILBIN/sudo"
chmod u+rw "$ENV_FILE"
write_env
ORIG2="$(digest_of "$ENV_FILE")"
chmod 000 "$ENV_FILE"
set +e
hash -r
PATH="$FAILBIN:$PATH" wr_compose_env_query_governed_value "$ENV_FILE" WOODRIGHT_BACKEND_IMAGE \
  >/dev/null 2>"$TMP/err-fail.txt"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "sudo python failure fail-closed" || fail "sudo python failure unexpectedly ok"
chmod u+r "$ENV_FILE"
NOW="$(digest_of "$ENV_FILE")"
[[ "$NOW" == "$ORIG2" ]] && pass "sudo failure: original hash unchanged" || fail "sudo failure mutated file"
assert_no_sentinel "sudo fail" "$(cat "$TMP/err-fail.txt")"

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAILED=$FAILED compose-env privileged pin-write"
  exit 1
fi
echo "OK compose-env privileged pin-write"
exit 0
