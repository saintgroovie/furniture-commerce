#!/usr/bin/env bash
# Fidelity: public_demo target env identity parse/rewrite/compare + pre-mutation gate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PY="$ROOT/ops/lib/woodright-public-demo-target-env.py"
PREP="$ROOT/ops/release/prepare-public-demo-target-env.sh"
PAIR="$ROOT/ops/release/cutover-public-demo-pair.sh"
COMMON="$ROOT/ops/lib/woodright-cutover-common.sh"
FAILED=0
TMP="$(mktemp -d /tmp/wr-target-env-test-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

TARGET=caf82b048b9caefae30679342aec3d4fc42a8d89
KEEPER=dd304d1bf92d59c85795b5091ed0386365bcca6d
SECRET='wr-test-secret-should-never-appear-in-logs-9f3c'

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

write_env() {
  local path="$1" sha="$2"
  umask 077
  cat >"$path" <<EOF
# comment
WOODRIGHT_RUNTIME_ROLE=public_demo
WOODRIGHT_EXPOSURE=public
WOODRIGHT_DATABASE_IDENTITY=public_demo_db
WOODRIGHT_RELEASE_SHA=${sha}
MOCK_SECRET=${SECRET}
EOF
  chmod 600 "$path"
}

# A matching
write_env "$TMP/ok-be.env" "$TARGET"
write_env "$TMP/ok-sf.env" "$TARGET"
if python3 "$PY" validate-pair --target-sha "$TARGET" --backend-env "$TMP/ok-be.env" --storefront-env "$TMP/ok-sf.env" >/dev/null; then
  pass "A matching env"
else
  fail "A matching env"
fi

# B keeper mismatch
write_env "$TMP/bad-be.env" "$KEEPER"
write_env "$TMP/bad-sf.env" "$KEEPER"
if python3 "$PY" validate-pair --target-sha "$TARGET" --backend-env "$TMP/bad-be.env" --storefront-env "$TMP/bad-sf.env" >/dev/null 2>"$TMP/b.err"; then
  fail "B keeper mismatch should fail"
else
  grep -q TARGET_ENV_RELEASE_SHA_MISMATCH "$TMP/b.err" && pass "B keeper mismatch token" || fail "B missing token"
fi
if grep -q "$SECRET" "$TMP/b.err"; then fail "B leaked secret"; else pass "B no secret leak"; fi

# C backend match storefront wrong
write_env "$TMP/c-be.env" "$TARGET"
write_env "$TMP/c-sf.env" "$KEEPER"
if python3 "$PY" validate-pair --target-sha "$TARGET" --backend-env "$TMP/c-be.env" --storefront-env "$TMP/c-sf.env" >/dev/null 2>"$TMP/c.err"; then
  fail "C storefront wrong should fail"
else
  grep -q TARGET_ENV_RELEASE_SHA_MISMATCH "$TMP/c.err" && pass "C storefront wrong" || fail "C token"
fi

# D storefront match backend wrong
write_env "$TMP/d-be.env" "$KEEPER"
write_env "$TMP/d-sf.env" "$TARGET"
if python3 "$PY" validate-pair --target-sha "$TARGET" --backend-env "$TMP/d-be.env" --storefront-env "$TMP/d-sf.env" >/dev/null 2>"$TMP/d.err"; then
  fail "D backend wrong should fail"
else
  grep -q TARGET_ENV_RELEASE_SHA_MISMATCH "$TMP/d.err" && pass "D backend wrong" || fail "D token"
fi

# E missing identity key
umask 077
printf 'WOODRIGHT_RUNTIME_ROLE=public_demo\nMOCK_SECRET=%s\n' "$SECRET" >"$TMP/e.env"
chmod 600 "$TMP/e.env"
if python3 "$PY" validate --component storefront --target-sha "$TARGET" --env-file "$TMP/e.env" >/dev/null 2>"$TMP/e.err"; then
  fail "E missing key should fail"
else
  grep -q TARGET_ENV_RELEASE_SHA_MISMATCH "$TMP/e.err" && pass "E missing key" || fail "E token"
fi

# F duplicate identity key
umask 077
printf 'WOODRIGHT_RELEASE_SHA=%s\nWOODRIGHT_RELEASE_SHA=%s\n' "$TARGET" "$TARGET" >"$TMP/f.env"
chmod 600 "$TMP/f.env"
if python3 "$PY" validate --component backend --target-sha "$TARGET" --env-file "$TMP/f.env" >/dev/null 2>"$TMP/f.err"; then
  fail "F duplicate should fail"
else
  grep -q TARGET_ENV_DUPLICATE_KEY "$TMP/f.err" && pass "F duplicate key" || fail "F token"
fi

# G malformed
umask 077
printf 'this is not an assignment\nWOODRIGHT_RELEASE_SHA=%s\n' "$TARGET" >"$TMP/g.env"
chmod 600 "$TMP/g.env"
if python3 "$PY" validate --component backend --target-sha "$TARGET" --env-file "$TMP/g.env" >/dev/null 2>"$TMP/g.err"; then
  fail "G malformed should fail"
else
  grep -q TARGET_ENV_MALFORMED "$TMP/g.err" && pass "G malformed" || fail "G token"
fi

# H filename spoof
mkdir -p "$TMP/caf82b0-spoof/env"
write_env "$TMP/caf82b0-spoof/env/backend.env" "$KEEPER"
if python3 "$PY" validate --component backend --target-sha "$TARGET" --env-file "$TMP/caf82b0-spoof/env/backend.env" >/dev/null 2>"$TMP/h.err"; then
  fail "H filename spoof should fail"
else
  grep -q TARGET_ENV_RELEASE_SHA_MISMATCH "$TMP/h.err" && pass "H filename spoof" || fail "H token"
fi

# I substitution in identity refused
umask 077
printf 'WOODRIGHT_RELEASE_SHA=$(whoami)\n' >"$TMP/i.env"
chmod 600 "$TMP/i.env"
if python3 "$PY" validate --component backend --target-sha "$TARGET" --env-file "$TMP/i.env" >/dev/null 2>"$TMP/i.err"; then
  fail "I substitution should fail"
else
  grep -q TARGET_ENV_MALFORMED "$TMP/i.err" && pass "I no shell substitution" || fail "I token"
fi

# J/K rewrite + compare + mode 600
write_env "$TMP/src-be.env" "$KEEPER"
write_env "$TMP/src-sf.env" "$KEEPER"
SRC_BE_HASH=$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$TMP/src-be.env")
cp -p "$TMP/src-be.env" "$TMP/src-be.env.orig"
python3 "$PY" rewrite --source "$TMP/src-be.env" --dest "$TMP/new-be.env" --target-sha "$TARGET" --source-sha256 "$SRC_BE_HASH" >/dev/null
python3 "$PY" rewrite --source "$TMP/src-sf.env" --dest "$TMP/new-sf.env" --target-sha "$TARGET" >/dev/null
mode_be=$(stat -c '%a' "$TMP/new-be.env" 2>/dev/null || stat -f '%Lp' "$TMP/new-be.env")
[[ "$mode_be" == "600" || "$mode_be" == "0600" ]] && pass "K mode 0600" || fail "K mode=$mode_be"
if python3 "$PY" compare --old "$TMP/src-be.env" --new "$TMP/new-be.env" --target-sha "$TARGET" | grep -q ENV_EQUIVALENT_EXCEPT_RELEASE_IDENTITY; then
  pass "J compare equivalent except identity"
else
  fail "J compare"
fi
cmp -s "$TMP/src-be.env" "$TMP/src-be.env.orig" && pass "M source unchanged after rewrite" || fail "M source mutated"

# overwrite refuse
if python3 "$PY" rewrite --source "$TMP/src-be.env" --dest "$TMP/new-be.env" --target-sha "$TARGET" >/dev/null 2>"$TMP/ow.err"; then
  fail "overwrite should fail"
else
  grep -q TARGET_ENV_DEST_EXISTS "$TMP/ow.err" && pass "refuse overwrite dest" || fail "overwrite token"
fi

# prepare dry-run (needs public_demo profile - use env override)
export WOODRIGHT_ENV_PROFILE_DIR="$ROOT/ops/config/runtime-environments"
if bash "$PREP" --environment public_demo --mode dry-run \
  --target-sha "$TARGET" \
  --source-backend-env "$TMP/src-be.env" \
  --source-storefront-env "$TMP/src-sf.env" \
  --output-dir "$TMP/out-dry" >"$TMP/prep-dry.out" 2>&1; then
  [[ ! -e "$TMP/out-dry/env/backend.env" ]] && pass "prepare dry-run no write" || fail "prepare dry-run wrote"
else
  fail "prepare dry-run failed"
  tail -n 20 "$TMP/prep-dry.out" || true
fi
if grep -q "$SECRET" "$TMP/prep-dry.out"; then fail "L prepare dry-run leaked secret"; else pass "L prepare dry-run no secrets"; fi

if bash "$PREP" --environment public_demo --mode execute \
  --target-sha "$TARGET" \
  --source-backend-env "$TMP/src-be.env" \
  --source-storefront-env "$TMP/src-sf.env" \
  --output-dir "$TMP/out-exec" \
  --confirm-mutation I_UNDERSTAND_PUBLIC_DEMO_TARGET_ENV >"$TMP/prep-ex.out" 2>&1; then
  pass "prepare execute"
else
  fail "prepare execute"
  tail -n 30 "$TMP/prep-ex.out" || true
fi
if grep -q "$SECRET" "$TMP/prep-ex.out"; then fail "L prepare execute leaked secret"; else pass "L prepare execute no secrets"; fi
grep -q TARGET_ENV_IDENTITY_VERIFIED_CAF82B0 "$TMP/prep-ex.out" && pass "prepare verified token" || fail "prepare verified token"

# common helper
# shellcheck source=/dev/null
source "$COMMON"
if wr_public_demo_assert_target_env_release_identity "$TARGET" "$TMP/ok-be.env" "$TMP/ok-sf.env" >/dev/null; then
  pass "common helper matching"
else
  fail "common helper matching"
fi
if wr_public_demo_assert_target_env_release_identity "$TARGET" "$TMP/bad-be.env" "$TMP/bad-sf.env" >/dev/null 2>"$TMP/cm.err"; then
  fail "common helper should reject keeper env"
else
  grep -q TARGET_ENV_RELEASE_SHA_MISMATCH "$TMP/cm.err" && pass "common helper mismatch" || fail "common helper token"
fi

# SOURCE_SHA keys rewritten when present
umask 077
cat >"$TMP/src-both.env" <<EOF
WOODRIGHT_RELEASE_SHA=${KEEPER}
WOODRIGHT_BACKEND_SOURCE_SHA=${KEEPER}
WOODRIGHT_STOREFRONT_SOURCE_SHA=${KEEPER}
MOCK_SECRET=${SECRET}
EOF
chmod 600 "$TMP/src-both.env"
python3 "$PY" rewrite --source "$TMP/src-both.env" --dest "$TMP/new-both.env" --target-sha "$TARGET" >/dev/null
python3 "$PY" validate --component backend --target-sha "$TARGET" --env-file "$TMP/new-both.env" >/dev/null \
  && pass "SOURCE_SHA keys rewritten" || fail "SOURCE_SHA keys"

grep -q 'wr_public_demo_assert_target_env_release_identity' "$PAIR" \
  && pass "pair wires env identity gate" || fail "pair missing env identity gate"
grep -q 'TARGET_ENV_RELEASE_SHA_MISMATCH' "$PAIR" \
  && pass "pair mismatch token" || fail "pair mismatch token"

# CAS snapshot + hash bind (Codex P1 TOCTOU)
H0=$(python3 "$PY" hash --env-file "$TMP/ok-be.env")
python3 "$PY" snapshot --source "$TMP/ok-be.env" --dest "$TMP/cas-be.env" --source-sha256 "$H0" >/dev/null \
  && pass "CAS snapshot" || fail "CAS snapshot"
cas_mode=$(stat -c '%a' "$TMP/cas-be.env" 2>/dev/null || stat -f '%Lp' "$TMP/cas-be.env")
[[ "$cas_mode" == "600" || "$cas_mode" == "0600" ]] && pass "CAS snapshot mode 0600" || fail "CAS mode"
python3 "$PY" assert-hash --env-file "$TMP/cas-be.env" --sha256 "$H0" >/dev/null \
  && pass "CAS assert-hash" || fail "CAS assert-hash"
printf 'WOODRIGHT_RELEASE_SHA=%s\n' "$KEEPER" >"$TMP/ok-be.env"
chmod 600 "$TMP/ok-be.env"
if python3 "$PY" snapshot --source "$TMP/ok-be.env" --dest "$TMP/cas-be2.env" --source-sha256 "$H0" >/dev/null 2>"$TMP/cas.err"; then
  fail "CAS should refuse drifted source"
else
  grep -q TARGET_ENV_SOURCE_CAS "$TMP/cas.err" && pass "CAS source drift refused" || fail "CAS drift token"
fi
printf 'WOODRIGHT_RELEASE_SHA=%s\n' "$KEEPER" >"$TMP/cas-be.env"
chmod 600 "$TMP/cas-be.env"
if python3 "$PY" assert-hash --env-file "$TMP/cas-be.env" --sha256 "$H0" >/dev/null 2>"$TMP/cas2.err"; then
  fail "assert-hash should fail after dest mutation"
else
  grep -q TARGET_ENV_SOURCE_CAS "$TMP/cas2.err" && pass "CAS dest drift refused" || fail "CAS dest token"
fi
grep -q 'wr_public_demo_bind_env_cas_for_create' "$ROOT/ops/release/recreate-staging-backend-with-media.sh" \
  && pass "backend recreate binds env CAS" || fail "backend missing env CAS bind"
grep -q 'wr_public_demo_assert_env_cas_hash' "$ROOT/ops/release/recreate-staging-backend-with-media.sh" \
  && pass "backend recreate asserts CAS before create" || fail "backend missing pre-create CAS"
grep -q 'wr_public_demo_docker_create_sealed_env' "$ROOT/ops/release/recreate-staging-backend-with-media.sh" \
  && pass "backend sealed docker create" || fail "backend missing sealed create"
grep -q 'wr_public_demo_docker_create_sealed_env' "$ROOT/ops/release/recreate-staging-storefront.sh" \
  && pass "storefront sealed docker create" || fail "storefront missing sealed create"

# prove-seal: mutate pathname after read; sealed inode keeps target SHA
write_env "$TMP/seal-src.env" "$TARGET"
write_env "$TMP/seal-mut.env" "$KEEPER"
SEAL_H=$(python3 "$PY" hash --env-file "$TMP/seal-src.env")
if python3 "$PY" prove-seal --env-file "$TMP/seal-src.env" --expected-sha256 "$SEAL_H" \
  --target-sha "$TARGET" --component backend --mutate-after-read "$TMP/seal-mut.env" \
  | grep -q TARGET_ENV_SEAL_OK; then
  pass "prove-seal survives pathname mutate after read"
else
  fail "prove-seal"
fi
python3 "$PY" keys --env-file "$TMP/seal-src.env" | grep -q "$KEEPER" \
  && pass "prove-seal did mutate pathname" || fail "prove-seal pathname not mutated"
# docker-create consumes sealed fd (not mutated pathname)
write_env "$TMP/seal-src2.env" "$TARGET"
SEAL_H2=$(python3 "$PY" hash --env-file "$TMP/seal-src2.env")
write_env "$TMP/seal-mut2.env" "$KEEPER"
# docker-create child reads sealed /dev/fd/N (pathname mutation covered by prove-seal)
if python3 "$PY" docker-create --env-file "$TMP/seal-src2.env" --expected-sha256 "$SEAL_H2" \
  --target-sha "$TARGET" --component storefront -- \
  python3 -c 'import sys; t=open(sys.argv[1],encoding="utf-8").read(); assert sys.argv[2] in t; print("SEALED_FD_OK")' \
  '{SEALED}' "$TARGET" | grep -q SEALED_FD_OK; then
  pass "docker-create sealed fd"
else
  fail "docker-create sealed fd"
fi

if [[ "$FAILED" -eq 0 ]]; then
  echo "OK public-demo target env fidelity"
  exit 0
fi
echo "FAILED count=$FAILED"
exit 1
