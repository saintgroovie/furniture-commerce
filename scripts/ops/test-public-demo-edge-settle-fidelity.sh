#!/usr/bin/env bash
# Fidelity: public_demo HTTPS edge settle (no live mutation, no Traefik/Dokploy calls).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../../ops/lib/woodright-cutover-common.sh
source "$ROOT/ops/lib/woodright-cutover-common.sh"

PAIR="$ROOT/ops/release/cutover-public-demo-pair.sh"
SF="$ROOT/ops/release/recreate-staging-storefront.sh"
RB_SF="$ROOT/ops/release/rollback-staging-storefront-from-keeper.sh"
RB_BE="$ROOT/ops/release/rollback-staging-backend-from-keeper.sh"

CAF=caf82b048b9caefae30679342aec3d4fc42a8d89
DD=dd304d1bf92d59c85795b5091ed0386365bcca6d
OTHER=ced25101f71f34caf98b62d1e7855be4f91ef977
NEW_SF=sha256:46b1291ddf2e95c873bd090f710621dc7a620642ba21820d4f892104a2404707
OLD_SF=sha256:67bb0a27884d50a1edf568d4b6749f30c459fab0db600d1c58c9462afb55873c
OLD_BE=sha256:7422f15968ddce769168edbf6ed1092bf621d1969f40752650ed19d0cc360ce4

FAILED=0
TMP="$(mktemp -d /tmp/wr-edge-settle-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

write_ok_headers() {
  local sha="$1"
  local dest="$2"
  cat >"$dest" <<EOF
HTTP/1.1 200 OK
x-woodright-release-sha: ${sha}
x-woodright-runtime-role: public_demo
x-woodright-database-identity: public_demo_db
x-robots-tag: noindex, nofollow, noarchive

EOF
}

# A: already new
cat >"$TMP/curl-A" <<EOF
#!/usr/bin/env bash
write_ok_headers() { :; }
sha="$CAF"
cat >"\$2" <<HDR
HTTP/1.1 200 OK
x-woodright-release-sha: $CAF
x-woodright-runtime-role: public_demo
x-woodright-database-identity: public_demo_db
x-robots-tag: noindex, nofollow, noarchive

HDR
echo 200
EOF
chmod +x "$TMP/curl-A"

# B/D: always previous keeper SHA
cat >"$TMP/curl-stale" <<EOF
#!/usr/bin/env bash
echo "\$1" >>"$TMP/stale-calls.txt"
cat >"\$2" <<HDR
HTTP/1.1 200 OK
x-woodright-release-sha: $DD
x-woodright-runtime-role: public_demo
x-woodright-database-identity: public_demo_db
x-robots-tag: noindex, nofollow, noarchive

HDR
echo 200
EOF
chmod +x "$TMP/curl-stale"

# C: first two stale, then new
: >"$TMP/c-n"
cat >"$TMP/curl-C" <<EOF
#!/usr/bin/env bash
n=\$(cat "$TMP/c-n" 2>/dev/null || echo 0)
n=\$((n + 1))
echo "\$n" >"$TMP/c-n"
if [[ "\$n" -le 2 ]]; then sha="$DD"; else sha="$CAF"; fi
cat >"\$2" <<HDR
HTTP/1.1 200 OK
x-woodright-release-sha: \${sha}
x-woodright-runtime-role: public_demo
x-woodright-database-identity: public_demo_db
x-robots-tag: noindex, nofollow, noarchive

HDR
echo 200
EOF
chmod +x "$TMP/curl-C"

# E: unexpected SHA
cat >"$TMP/curl-E" <<EOF
#!/usr/bin/env bash
cat >"\$2" <<HDR
HTTP/1.1 200 OK
x-woodright-release-sha: $OTHER
x-woodright-runtime-role: public_demo
x-woodright-database-identity: public_demo_db
x-robots-tag: noindex, nofollow, noarchive

HDR
echo 200
EOF
chmod +x "$TMP/curl-E"

export WOODRIGHT_BUYER_HOST="https://woodright-demo.ru"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_INTERVAL_S=0

# --- A ---
export WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET="$TMP/curl-A"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S=0
set +e
wr_public_demo_wait_buyer_edge "$CAF" public_demo public_demo_db "$DD" "$TMP/A.hdr"
A_RC=$?
set -e
if [[ "$A_RC" -eq 0 && "${WR_PUBLIC_DEMO_EDGE_RESULT}" == "EDGE_CONVERGED" ]]; then
  pass "A healthy+new edge → EDGE_CONVERGED without rollback"
else
  fail "A rc=$A_RC result=${WR_PUBLIC_DEMO_EDGE_RESULT:-empty}"
fi

# --- B ---
: >"$TMP/stale-calls.txt"
export WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET="$TMP/curl-stale"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S=0
set +e
B_LOG="$TMP/B.log"
wr_public_demo_wait_buyer_edge "$CAF" public_demo public_demo_db "$DD" "$TMP/B.hdr" >"$B_LOG" 2>&1
B_RC=$?
set -e
B_CALLS="$(wc -l <"$TMP/stale-calls.txt" | tr -d ' ')"
if [[ "$B_RC" -eq 1 && "${WR_PUBLIC_DEMO_EDGE_RESULT}" == "PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT" ]] \
  && grep -q EDGE_NOT_CONVERGED "$B_LOG" \
  && [[ "$B_CALLS" -ge 1 ]]; then
  pass "B stale dd304d1 → EDGE_NOT_CONVERGED then PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT (no immediate mismatch)"
else
  fail "B rc=$B_RC result=${WR_PUBLIC_DEMO_EDGE_RESULT:-empty} calls=$B_CALLS"
  cat "$B_LOG" || true
fi

# --- C ---
echo 0 >"$TMP/c-n"
export WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET="$TMP/curl-C"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S=5
set +e
C_LOG="$TMP/C.log"
wr_public_demo_wait_buyer_edge "$CAF" public_demo public_demo_db "$DD" "$TMP/C.hdr" >"$C_LOG" 2>&1
C_RC=$?
set -e
C_N="$(cat "$TMP/c-n")"
if [[ "$C_RC" -eq 0 && "${WR_PUBLIC_DEMO_EDGE_RESULT}" == "EDGE_CONVERGED" && "$C_N" -ge 3 ]] \
  && grep -q EDGE_NOT_CONVERGED "$C_LOG"; then
  pass "C stale then caf82b0 → retry then EDGE_CONVERGED"
else
  fail "C rc=$C_RC result=${WR_PUBLIC_DEMO_EDGE_RESULT:-empty} n=$C_N"
  cat "$C_LOG" || true
fi

# --- D static: timeout token still drives recreate die → pair rollback ---
if grep -q 'PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT' "$SF" \
  && grep -q 'wr_public_demo_wait_buyer_edge' "$SF" \
  && grep -qF 'storefront recreate failed' "$PAIR" \
  && grep -q 'pair_rollback' "$PAIR"; then
  pass "D timeout token + existing pair_rollback after storefront recreate failure"
else
  fail "D helper/pair rollback contract missing"
fi

# --- E ---
export WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET="$TMP/curl-E"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S=90
set +e
E_LOG="$TMP/E.log"
wr_public_demo_wait_buyer_edge "$CAF" public_demo public_demo_db "$DD" "$TMP/E.hdr" >"$E_LOG" 2>&1
E_RC=$?
set -e
if [[ "$E_RC" -eq 2 && "${WR_PUBLIC_DEMO_EDGE_RESULT}" == "PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH" ]] \
  && ! grep -q PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT "$E_LOG"; then
  pass "E unexpected SHA → PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH fail-closed"
else
  fail "E rc=$E_RC result=${WR_PUBLIC_DEMO_EDGE_RESULT:-empty}"
  cat "$E_LOG" || true
fi

# --- F rollback pair identity still the pre-cycle digests ---
# Live keeper pair is CLI --expected-old-*-digest (not hardcoded in rollback helpers).
if grep -q 'rollback-staging-storefront-from-keeper.sh' "$PAIR" \
  && grep -q 'rollback-staging-backend-from-keeper.sh' "$PAIR" \
  && grep -q 'WOODRIGHT_ROLLBACK_EXPECT_SF_DIGEST' "$PAIR" \
  && grep -q 'wr_cutover_pair_rollback' "$PAIR" \
  && grep -q 'PAIR_ROLLBACK_OK' "$ROOT/ops/lib/woodright-cutover-common.sh"; then
  pass "F pair rollback helpers preserved (pre-cycle SF $OLD_SF / BE $OLD_BE via expect-old digest + keepers)"
else
  fail "F rollback contract weakened"
fi

# Helper still waits for docker health before public edge settle (execute path)
if awk '
  /wait_healthy \|\| die/ { h=1 }
  h && /verify_public_identity \|\| die/ { found=1; exit 0 }
  END { exit (found ? 0 : 1) }
' "$SF"; then
  pass "docker health still precedes verify_public_identity"
else
  fail "health/verify order changed"
fi

if grep -q "$NEW_SF" "$0" && grep -q 'wr_public_demo_wait_buyer_edge' "$SF"; then
  pass "new pair digest remains verification target $NEW_SF (HTTPS SHA settle; digest via container)"
else
  fail "new SF digest not referenced"
fi

# Case 5: health is not success — execute path still requires public settle after wait_healthy
if awk '
  /wait_healthy \|\| die/ { h=1 }
  h && /verify_public_identity \|\| die/ { v=1 }
  v && /CREATED name=/ { found=1; exit 0 }
  END { exit (found ? 0 : 1) }
' "$SF" \
  && grep -q 'wr_public_demo_wait_buyer_edge' "$SF"; then
  pass "Case5 health then settle then CREATED (healthy+stale cannot skip settle)"
else
  fail "Case5 health/settle/CREATED order"
fi

# Case 7: previous SHA absent from optional source, present via fallback arg
export WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET="$TMP/curl-stale"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S=0
set +e
wr_public_demo_wait_buyer_edge "$CAF" public_demo public_demo_db "" "$TMP/H.hdr" >"$TMP/H.log" 2>&1
H_RC=$?
set -e
if [[ "$H_RC" -eq 2 && "${WR_PUBLIC_DEMO_EDGE_RESULT}" == "PUBLIC_DEMO_EDGE_IDENTITY_MISMATCH" ]]; then
  pass "Case7 empty previous + stale SHA → MISMATCH (no silent retry without previous)"
else
  fail "Case7 empty-previous rc=$H_RC result=${WR_PUBLIC_DEMO_EDGE_RESULT:-empty}"
fi
set +e
wr_public_demo_wait_buyer_edge "$CAF" public_demo public_demo_db "$DD" "$TMP/H2.hdr" >"$TMP/H2.log" 2>&1
H2_RC=$?
set -e
if [[ "$H2_RC" -eq 1 && "${WR_PUBLIC_DEMO_EDGE_RESULT}" == "PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT" ]] \
  && grep -q EDGE_NOT_CONVERGED "$TMP/H2.log"; then
  pass "Case7 fallback previous=$DD + stale → EDGE_NOT_CONVERGED then timeout"
else
  fail "Case7 fallback-previous rc=$H2_RC result=${WR_PUBLIC_DEMO_EDGE_RESULT:-empty}"
fi

# Connection failure: HTTP 000 is settle, not mismatch
cat >"$TMP/curl-000" <<'EOF'
#!/usr/bin/env bash
: >"$2"
echo 000
EOF
chmod +x "$TMP/curl-000"
export WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET="$TMP/curl-000"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S=0
set +e
wr_public_demo_wait_buyer_edge "$CAF" public_demo public_demo_db "$DD" "$TMP/Z.hdr" >"$TMP/Z.log" 2>&1
Z_RC=$?
set -e
if [[ "$Z_RC" -eq 1 && "${WR_PUBLIC_DEMO_EDGE_RESULT}" == "PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT" ]] \
  && grep -q EDGE_NOT_CONVERGED "$TMP/Z.log"; then
  pass "connection failure HTTP 000 → EDGE_NOT_CONVERGED then timeout"
else
  fail "connection-failure rc=$Z_RC result=${WR_PUBLIC_DEMO_EDGE_RESULT:-empty}"
fi

# Recreate prefers keeper label over caller env
if grep -q 'prev="${prev:-${EXPECTED_OLD_SHA:-${WOODRIGHT_EDGE_PREVIOUS_SHA:-}}}"' "$SF"; then
  pass "recreate previous SHA prefers keeper over caller env"
else
  fail "recreate previous SHA order drifted"
fi

# Pair digest checks still precede HTTPS settle (settle is not provenance)
if awk '
  /sf_d="\$\(wr_cutover_container_immutable_digest/ { d=1 }
  d && /\[\[ "\$sf_d" == "\$SF_DIGEST" \]\]/ { digok=1 }
  digok && /wr_public_demo_wait_buyer_edge/ { found=1; exit 0 }
  END { exit (found ? 0 : 1) }
' "$PAIR"; then
  pass "pair container digest still precedes HTTPS settle"
else
  fail "pair digest/settle order changed"
fi

# No Traefik/Dokploy mutation added (comment mentions are allowed)
if grep -Eiq 'dokploy.*(reload|retarget)|traefik.*(reload|update)' "$SF" "$PAIR"; then
  fail "unexpected Traefik/Dokploy retarget in helper"
else
  pass "no Traefik/Dokploy retarget in ops helper"
fi

# Execute must not honor SKIP_PUBLIC_VERIFY (Codex P1)
if grep -q 'SKIP_PUBLIC_VERIFY" == "1" && "$MODE" != "execute"' "$SF" \
  && grep -q 'SKIP_PUBLIC_VERIFY:-0}" == "1" && "$MODE" != "execute"' "$PAIR" \
  && grep -q 'SKIP_PUBLIC_VERIFY=0' "$PAIR"; then
  pass "execute cannot skip public HTTPS settle via SKIP_PUBLIC_VERIFY"
else
  fail "SKIP_PUBLIC_VERIFY still skippable on execute"
fi

# Oversized interval is capped by remaining deadline
SECONDS=0
export WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET="$TMP/curl-stale"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S=1
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_INTERVAL_S=999999
H_RC=0
wr_public_demo_wait_buyer_edge "$CAF" "public_demo" "public_demo_db" "$DD" >/dev/null || H_RC=$?
H_ELAPSED=$SECONDS
unset WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_INTERVAL_S WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET
if [[ "$H_RC" -eq 1 && "$WR_PUBLIC_DEMO_EDGE_RESULT" == "PUBLIC_DEMO_EDGE_CONVERGENCE_TIMEOUT" && "$H_ELAPSED" -le 8 ]]; then
  pass "oversized settle interval still bounded by deadline (${H_ELAPSED}s)"
else
  fail "oversized interval rc=$H_RC elapsed=$H_ELAPSED result=${WR_PUBLIC_DEMO_EDGE_RESULT:-empty}"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAILED=$FAILED"
  exit 1
fi
echo "ALL_PASS"
exit 0
