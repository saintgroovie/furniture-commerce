#!/usr/bin/env bash
# Fidelity: privileged SHA-256 fingerprint of a root-only candidate compose .env.
# Never cats secrets. sudo is used only as `sudo -n sha256sum -- <realpath>`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$ROOT/ops/lib/woodright-compose-env-authority.sh"
CUTOVER="$ROOT/ops/release/cutover-production-candidate.sh"
SENTINEL="THIS_MUST_NEVER_APPEAR_IN_OUTPUT"

FAILED=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

# shellcheck source=../../ops/lib/woodright-compose-env-authority.sh
source "$LIB"

TMP="$(cd "$(mktemp -d /tmp/wr-compose-env-fp-XXXXXX)" && pwd -P)"
cleanup() {
  chmod u+rw "$TMP/etc/dokploy/compose/woodright-production/code/.env" 2>/dev/null || true
  if [[ "$FAILED" -eq 0 ]]; then rm -rf "$TMP"
  else echo "harness kept: $TMP"; fi
}
trap cleanup EXIT

COMPOSE_PARENT="$TMP/etc/dokploy/compose/woodright-production"
ENV_DIR="$COMPOSE_PARENT/code"
ENV_FILE="$ENV_DIR/.env"
OTHER="$ENV_DIR/other.env"
PUBLIC_PARENT="$TMP/etc/dokploy/compose/woodright-public-production/code"
PUBLIC_ENV="$PUBLIC_PARENT/.env"
BIN="$TMP/bin"
NOSUDO="$TMP/nosudo"
FAILSUDO="$TMP/failsudo"
mkdir -p "$ENV_DIR" "$PUBLIC_PARENT" "$BIN" "$NOSUDO" "$FAILSUDO"

printf 'WOODRIGHT_BACKEND_IMAGE=ghcr.io/example/backend@sha256:%s\nSECRET=%s\n' \
  "$(printf 'a%.0s' {1..64})" "$SENTINEL" >"$ENV_FILE"
printf 'other=1\nSECRET=%s\n' "$SENTINEL" >"$OTHER"
printf 'SECRET=%s\n' "$SENTINEL" >"$PUBLIC_ENV"

digest_of() {
  local path="$1"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  else
    sha256sum -- "$path" | awk '{print $1}'
  fi
}

assert_no_sentinel() {
  local label="$1"
  shift
  local blob
  blob="$(printf '%s\n' "$@")"
  if grep -F -q "$SENTINEL" <<<"$blob"; then
    fail "$label: sentinel leaked"
  else
    pass "$label: sentinel absent"
  fi
}

WANT="$(digest_of "$ENV_FILE")"

# --------------------------------------------------------------------------
# 1) Readable file: unprivileged hash, output is the digest only.
# --------------------------------------------------------------------------
FP_ERR="$TMP/err-readable.txt"
set +e
GOT="$(wr_compose_env_sha256_fingerprint "$ENV_FILE" "$ENV_FILE" "$COMPOSE_PARENT" 2>"$FP_ERR")"
RC=$?
set -e
[[ "$RC" -eq 0 && "$GOT" == "unprivileged $WANT" ]] && pass "readable: digest matches unprivileged hash" \
  || fail "readable: rc=$RC got=$GOT want=unprivileged $WANT"
[[ "${GOT%% *}" == "unprivileged" ]] \
  && pass "readable: method=unprivileged" || fail "readable: method=${GOT%% *}"
[[ "$GOT" != *"$SENTINEL"* ]] && pass "readable: stdout has no sentinel" || fail "readable: stdout leaked"
assert_no_sentinel "readable stderr" "$(cat "$FP_ERR")"

# --------------------------------------------------------------------------
# Privileged shims. Direct hasher must not be invoked; sudo prints a canned digest.
# --------------------------------------------------------------------------
cat >"$BIN/sha256sum" <<'EOF'
#!/bin/sh
echo "unprivileged sha256sum must not run for protected files" >&2
exit 97
EOF
chmod +x "$BIN/sha256sum"

cat >"$BIN/sudo" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-n" && "\${2:-}" == "sha256sum" && "\${3:-}" == "--" && -n "\${4:-}" ]]; then
  printf '%s  %s\n' "$WANT" "\$4"
  exit 0
fi
echo "unexpected sudo argv: \$*" >&2
exit 1
EOF
chmod +x "$BIN/sudo"

cat >"$NOSUDO/sha256sum" <<'EOF'
#!/bin/sh
exit 97
EOF
chmod +x "$NOSUDO/sha256sum"
if command -v date >/dev/null 2>&1; then
  ln -sf "$(command -v date)" "$NOSUDO/date"
fi

cat >"$FAILSUDO/sha256sum" <<'EOF'
#!/bin/sh
exit 97
EOF
chmod +x "$FAILSUDO/sha256sum"
cat >"$FAILSUDO/sudo" <<'EOF'
#!/usr/bin/env bash
echo "simulated privileged hasher failure" >&2
exit 42
EOF
chmod +x "$FAILSUDO/sudo"

chmod 000 "$ENV_FILE"
if [[ -r "$ENV_FILE" ]]; then
  fail "protected fixture is still readable after chmod 000 (cannot simulate)"
  chmod u+rw "$ENV_FILE"
else
  pass "protected fixture: direct read denied"
fi

# --------------------------------------------------------------------------
# 2) Unreadable file + working sudo -n sha256sum shim.
# --------------------------------------------------------------------------
export PATH="$BIN:$PATH"
FP_ERR="$TMP/err-privileged.txt"
set +e
GOT="$(wr_compose_env_sha256_fingerprint "$ENV_FILE" "$ENV_FILE" "$COMPOSE_PARENT" 2>"$FP_ERR")"
RC=$?
set -e
[[ "$RC" -eq 0 && "$GOT" == "privileged $WANT" ]] && pass "privileged: digest matches pre-chmod hash" \
  || fail "privileged: rc=$RC got=$GOT want=privileged $WANT"
[[ "${GOT%% *}" == "privileged" ]] \
  && pass "privileged: method=privileged" || fail "privileged: method=${GOT%% *}"
assert_no_sentinel "privileged stdout" "$GOT"
assert_no_sentinel "privileged stderr" "$(cat "$FP_ERR")"
if grep -q 'sudo cat\|sudo -n cat' "$FP_ERR"; then
  fail "privileged: stderr mentions cat"
else
  pass "privileged: hasher is sudo -n sha256sum (no cat)"
fi

# --------------------------------------------------------------------------
# 3) sudo missing -> fail closed.
# --------------------------------------------------------------------------
FP_ERR="$TMP/err-nosudo.txt"
set +e
GOT="$(PATH="$NOSUDO" wr_compose_env_sha256_fingerprint "$ENV_FILE" "$ENV_FILE" "$COMPOSE_PARENT" 2>"$FP_ERR")"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "sudo missing: fail closed rc=$RC" || fail "sudo missing: unexpectedly succeeded got=$GOT"
assert_no_sentinel "sudo missing stdout" "$GOT"
assert_no_sentinel "sudo missing stderr" "$(cat "$FP_ERR")"

# --------------------------------------------------------------------------
# 4) privileged hasher non-zero -> fail closed.
# --------------------------------------------------------------------------
FP_ERR="$TMP/err-sudo-fail.txt"
set +e
GOT="$(PATH="$FAILSUDO:$PATH" wr_compose_env_sha256_fingerprint "$ENV_FILE" "$ENV_FILE" "$COMPOSE_PARENT" 2>"$FP_ERR")"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "sudo non-zero: fail closed rc=$RC" || fail "sudo non-zero: unexpectedly succeeded got=$GOT"
assert_no_sentinel "sudo non-zero stdout" "$GOT"
assert_no_sentinel "sudo non-zero stderr" "$(cat "$FP_ERR")"

# --------------------------------------------------------------------------
# 5b) realpath missing -> fail closed (no lexical privileged oracle).
# --------------------------------------------------------------------------
FP_ERR="$TMP/err-norealpath.txt"
set +e
GOT="$(PATH="$NOSUDO" wr_compose_env_sha256_fingerprint "$ENV_FILE" "$ENV_FILE" "$COMPOSE_PARENT" 2>"$FP_ERR")"
RC=$?
set -e
# Restore readability for the remaining mismatch cases below; this case only
# needs fail-closed when realpath is absent (NOSUDO PATH has no realpath).
[[ "$RC" -ne 0 ]] && pass "realpath missing: fail closed rc=$RC" || fail "realpath missing: unexpectedly succeeded got=$GOT"
assert_no_sentinel "realpath missing stdout" "$GOT"
assert_no_sentinel "realpath missing stderr" "$(cat "$FP_ERR")"

# --------------------------------------------------------------------------
# 5) path mismatch / public-production / symlink: no privileged arbitrary hash.
# --------------------------------------------------------------------------
chmod u+rw "$ENV_FILE" "$OTHER" "$PUBLIC_ENV" 2>/dev/null || true
chmod 000 "$OTHER" "$PUBLIC_ENV" "$ENV_FILE" 2>/dev/null || true

FP_ERR="$TMP/err-mismatch.txt"
set +e
GOT="$(wr_compose_env_sha256_fingerprint "$OTHER" "$ENV_FILE" "$COMPOSE_PARENT" 2>"$FP_ERR")"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "mismatch path: refused" || fail "mismatch path: hashed other.env got=$GOT"
assert_no_sentinel "mismatch stdout" "$GOT"

FP_ERR="$TMP/err-public.txt"
set +e
GOT="$(wr_compose_env_sha256_fingerprint "$PUBLIC_ENV" "$ENV_FILE" "$COMPOSE_PARENT" 2>"$FP_ERR")"
RC=$?
set -e
[[ "$RC" -ne 0 ]] && pass "public-production path vs candidate expected: refused" \
  || fail "public-production: privileged oracle hashed it got=$GOT"

SYMLINK="$ENV_DIR/link.env"
ln -s "$ENV_FILE" "$SYMLINK" 2>/dev/null || true
if [[ -L "$SYMLINK" ]]; then
  FP_ERR="$TMP/err-symlink.txt"
  set +e
  GOT="$(wr_compose_env_sha256_fingerprint "$SYMLINK" "$SYMLINK" "$COMPOSE_PARENT" 2>"$FP_ERR")"
  RC=$?
  set -e
  [[ "$RC" -ne 0 ]] && pass "symlink: refused" || fail "symlink: hashed through link got=$GOT"
else
  pass "symlink: ln not available (skipped)"
fi

# --------------------------------------------------------------------------
# 6) Cutover helper wiring: PRELOCK uses fingerprint, never sudo cat.
# --------------------------------------------------------------------------
grep -q 'fingerprint_compose_env' "$CUTOVER" \
  && pass "cutover: fingerprint_compose_env exists" || fail "cutover: missing fingerprint helper"
grep -q 'PRELOCK_PIN_SHA="$COMPOSE_ENV_FINGERPRINT"' "$CUTOVER" \
  && grep -q 'apply_compose_env_fingerprint_record' "$CUTOVER" \
  && pass "cutover: PRELOCK uses fingerprint_compose_env" || fail "cutover: PRELOCK still sha256_of"
grep -q 'UNDER_PIN_SHA="$COMPOSE_ENV_FINGERPRINT"' "$CUTOVER" \
  && pass "cutover: UNDER_PIN uses fingerprint_compose_env" || fail "cutover: UNDER_PIN still sha256_of"
if grep -qE 'sudo[[:space:]]+cat|sudo[[:space:]]+-n[[:space:]]+cat' "$CUTOVER" "$LIB"; then
  fail "cutover/lib: sudo cat present"
else
  pass "cutover/lib: no sudo cat"
fi
if grep -q 'sudo -n sha256sum --' "$LIB"; then
  pass "lib: privileged hasher is sudo -n sha256sum --"
else
  fail "lib: missing sudo -n sha256sum --"
fi
if grep -qE 'woodright-public-production|woodright-stack-3dsdhd' "$CUTOVER"; then
  pass "cutover: deny-list names public/demo compose roots"
else
  fail "cutover: missing public/demo deny-list"
fi

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK compose-env privileged fingerprint"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
