#!/usr/bin/env bash
# Fidelity tests for Wave 1 container memory limits (MemorySwap + rollback policy).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="$ROOT/ops/lib/woodright-memory-limits.sh"
APPLY="$ROOT/ops/release/apply-memory-limits-resource-only.sh"
STAGING="$ROOT/docker-compose.staging.yml"
PROD="$ROOT/ops/compose/woodright-production.docker-compose.yml"
SF="$ROOT/ops/release/recreate-staging-storefront.sh"
BE="$ROOT/ops/release/recreate-staging-backend-with-media.sh"
FAIL=0
pass(){ echo "PASS: $*"; }
fail(){ echo "FAIL: $*"; FAIL=$((FAIL+1)); }

source "$LIB"

bash -n "$LIB" && pass "bash -n lib" || fail "bash -n lib"
bash -n "$APPLY" && pass "bash -n apply" || fail "bash -n apply"
bash -n "$SF" && pass "bash -n sf recreate" || fail "bash -n sf"
bash -n "$BE" && pass "bash -n be recreate" || fail "bash -n be"

wr_mem_validate_triplet storefront 192m 512m 512m && pass "sf triplet" || fail "sf triplet"
wr_mem_validate_triplet backend 640m 1536m 1536m && pass "be triplet" || fail "be triplet"
wr_mem_validate_triplet storefront 192m 512m 256m && fail "swap<lim" || pass "swap<lim rejected"
wr_mem_validate_triplet storefront 192m 512m 1024m && fail "swap!=lim" || pass "swap!=lim rejected"
wr_mem_validate_pair storefront 0m 512m && fail "zero" || pass "zero rejected"
wr_mem_validate_pair backend 2000m 1536m && fail "res>lim" || pass "res>lim rejected"
wr_mem_host_reserve_ok 7940 1664 && pass "host reserve" || fail "host reserve"

grep -q 'memswap_limit:.*512m' "$STAGING" && pass "staging sf memswap" || fail "staging sf memswap"
grep -q 'memswap_limit:.*1536m' "$STAGING" && pass "staging be memswap" || fail "staging be memswap"
grep -q 'memswap_limit:.*512m' "$PROD" && pass "prod sf memswap" || fail "prod sf memswap"
grep -q 'memswap_limit:.*1536m' "$PROD" && pass "prod be memswap" || fail "prod be memswap"
grep -q '\-eq 6' "$SF" && pass "sf recreate eq 6 flags" || fail "sf flags"
grep -q '\-eq 6' "$BE" && pass "be recreate eq 6 flags" || fail "be flags"
grep -q 'memory-swap' "$SF" && grep -q '_wr_mem_sf\[4\]' "$SF" && pass "sf flag order check" || fail "sf flag order"
grep -q '_wr_mem_be\[4\]' "$BE" && pass "be flag order check" || fail "be flag order"

# Script path: rollback mode refuses unlimited without docker present if container missing —
# unit-level refuse already covers token; also ensure apply script wires refuse before update
grep -n 'wr_mem_refuse_unlimited_rollback\|RESOURCE_ROLLBACK_TO_UNLIMITED' "$APPLY" | head -5 >/dev/null \
  && pass "apply wires unlimited refuse" || fail "apply wires unlimited refuse"
grep -q 'resolve_prev_triplet\|WR_MEM_PREV_' "$APPLY" && pass "per-target prev triplet" || fail "per-target prev"

[[ "$(wr_mem_to_bytes 192m)" == "201326592" ]] && pass "bytes 192" || fail "bytes 192"
[[ "$(wr_mem_to_bytes 512m)" == "536870912" ]] && pass "bytes 512" || fail "bytes 512"
[[ "$(wr_mem_to_bytes 640m)" == "671088640" ]] && pass "bytes 640" || fail "bytes 640"
[[ "$(wr_mem_to_bytes 1536m)" == "1610612736" ]] && pass "bytes 1536" || fail "bytes 1536"

out="$(wr_mem_docker_flags_storefront)"
echo "$out" | tr '\n' ' ' | grep -q -- '--memory-swap 512m' && pass "sf swap flag" || fail "sf swap flag"
out="$(wr_mem_docker_flags_backend)"
echo "$out" | tr '\n' ' ' | grep -q -- '--memory-swap 1536m' && pass "be swap flag" || fail "be swap flag"

# Unlimited rollback refuse (no docker)
if out="$(wr_mem_refuse_unlimited_rollback 536870912 0 2>&1)"; then
  fail "should refuse unlimited rollback"
else
  echo "$out" | grep -q 'RESOURCE_ROLLBACK_TO_UNLIMITED_REQUIRES_RECREATE' \
    && pass "unlimited rollback token" || fail "unlimited rollback token"
fi
# Already unlimited desired+current → ok
wr_mem_refuse_unlimited_rollback 0 0 && pass "already unlimited ok" || fail "already unlimited"

grep -q 'RESOURCE_ROLLBACK_TO_UNLIMITED_REQUIRES_RECREATE' "$LIB" "$APPLY" \
  && pass "token in helpers" || fail "token in helpers"
grep -q -- '--memory-swap' "$APPLY" && pass "apply memory-swap" || fail "apply memory-swap"
grep -nE 'docker compose up|docker service update' "$APPLY" && fail "compose-up" || pass "no compose-up"
grep -EIn '6ed16081|d9d2330|sha256:[0-9a-f]{20,}' "$LIB" "$APPLY" && fail "hardcoded ids" || pass "no hardcoded ids"

# Secrets heuristic
if grep -EIn 'password|api_key|BEGIN RSA|SECRET=' "$LIB" "$APPLY" "$PROD" 2>/dev/null | grep -v 'COOKIE_SECRET\|JWT_SECRET\|POSTGRES_PASSWORD\|WOODRIGHT_DB_PASSWORD\|PUBLISHABLE_KEY\|:?set'; then
  fail "secret-like"
else
  pass "no unexpected secrets"
fi

# dry-run rollback mode refuses without docker when we mock via unit test above; script path:
# Document that --mode rollback calls refuse before update

# compose fixture inject memswap
FIX=$(mktemp)
cat > "$FIX" <<'YAML'
services:
  backend:
    image: x
    restart: unless-stopped
  storefront:
    image: y
    restart: unless-stopped
YAML
python3 - "$FIX" <<'PY'
import sys,re
path=sys.argv[1]; text=open(path).read()
def sb(src,s):
  m=re.search(rf"(^  {s}:\n)(.*?)(?=^  [a-zA-Z]|\Z)",src,flags=re.M|re.S); return m.start(),m.end(),m.group(0)
def ens(service,res,lim,swap,src):
  a,b,block=sb(src,service)
  block2=re.sub(r"^\s+mem_.*\n","",block,flags=re.M)
  m=re.search(r"(^\s+restart: unless-stopped\n)",block2,flags=re.M)
  ins=m.group(1)+f'    mem_reservation: "{res}"\n    mem_limit: "{lim}"\n    memswap_limit: "{swap}"\n'
  block2=block2[:m.start()]+ins+block2[m.end():]
  return src[:a]+block2+src[b:]
out=ens("backend","640m","1536m","1536m",text)
out=ens("storefront","192m","512m","512m",out)
assert "memswap_limit: \"512m\"" in out and "memswap_limit: \"1536m\"" in out
print("ok")
PY
rm -f "$FIX"
pass "compose memswap fixture"

# Mocked docker: single-target unlimited PREV must fail closed without update
MOCKBIN=$(mkdir -p /tmp/wr-mem-mock-$$ && echo /tmp/wr-mem-mock-$$)
cat > "$MOCKBIN/docker" <<'MOCK'
#!/usr/bin/env bash
echo "DOCKER_CALLED $*" >>"${MOCK_LOG:?}"
if [[ "$1" == "inspect" ]]; then
  if [[ "$*" == *HostConfig.Memory* ]]; then echo "536870912 201326592 536870912"; exit 0; fi
  echo "sha256:deadbeef"; exit 0
fi
exit 0
MOCK
chmod +x "$MOCKBIN/docker"
MOCK_LOG="$MOCKBIN/calls.log"; export MOCK_LOG; : >"$MOCK_LOG"
set +e
OUT=$(PATH="$MOCKBIN:$PATH" WR_MEM_PREV_MEMORY=0 WR_MEM_PREV_RESERVATION=0 WR_MEM_PREV_SWAP=0 \
  bash "$APPLY" --mode rollback-nonzero --targets woodright-staging-storefront \
  --confirm-mutation I_UNDERSTAND_MEMORY_LIMITS_RESOURCE_ONLY 2>&1)
RC=$?
set -e
if [[ "$RC" -ne 0 ]] && echo "$OUT" | grep -q 'RESOURCE_ROLLBACK_TO_UNLIMITED_REQUIRES_RECREATE'; then
  if grep -E 'DOCKER_CALLED update' "$MOCK_LOG" >/dev/null 2>&1; then
    fail "docker update called on unlimited rollback"
  else
    pass "mocked unlimited rollback: no docker update"
  fi
else
  fail "mocked unlimited rollback should fail closed (rc=$RC)"
  echo "$OUT" | tail -5
fi
: >"$MOCK_LOG"
set +e
OUT=$(PATH="$MOCKBIN:$PATH" WR_MEM_PREV_MEMORY=536870912 WR_MEM_PREV_RESERVATION=201326592 WR_MEM_PREV_SWAP=536870912 \
  bash "$APPLY" --mode rollback-nonzero --targets all \
  --confirm-mutation I_UNDERSTAND_MEMORY_LIMITS_RESOURCE_ONLY 2>&1)
RC=$?
set -e
if [[ "$RC" -ne 0 ]] && ! grep -E 'DOCKER_CALLED update' "$MOCK_LOG" >/dev/null 2>&1; then
  pass "multi-target global PREV rejected without update"
else
  fail "multi-target global PREV should fail without update"
fi
rm -rf "$MOCKBIN"

[[ "$FAIL" -eq 0 ]] && echo "RESULT: PASS" && exit 0
echo "RESULT: FAIL count=$FAIL"; exit 1

# P1: staging recreate helpers require explicit --mode (never default execute)
grep -q 'woodright-recreate-mode.sh\|RECREATE_MODE_REQUIRED' "$BE" "$SF" \
  && pass "recreate mode contract wired" || fail "recreate mode contract wired"
grep -q 'MODE="execute"' "$SF" && fail "sf default execute" || pass "sf no default execute"
grep -q -- '--mode execute' "$ROOT/ops/release/cutover-public-demo-pair.sh" \
  && pass "pair execute mode to backend" || fail "pair execute mode to backend"
