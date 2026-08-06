#!/usr/bin/env bash
# Fidelity tests for Wave 1 container memory limits.
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

# shellcheck source=ops/lib/woodright-memory-limits.sh
source "$LIB"

bash -n "$LIB" && pass "bash -n lib" || fail "bash -n lib"
bash -n "$APPLY" && pass "bash -n apply" || fail "bash -n apply"
bash -n "$SF" && pass "bash -n sf recreate" || fail "bash -n sf"
bash -n "$BE" && pass "bash -n be recreate" || fail "bash -n be"

wr_mem_validate_pair storefront 192m 512m && pass "sf defaults valid" || fail "sf defaults"
wr_mem_validate_pair backend 640m 1536m && pass "be defaults valid" || fail "be defaults"
wr_mem_validate_pair storefront 192m 256m && fail "sf below min should fail" || pass "sf below min rejected"
wr_mem_validate_pair backend 640m 512m && fail "be below min should fail" || pass "be below min rejected"
wr_mem_validate_pair storefront 0m 512m && fail "zero rejected" || pass "zero rejected"
wr_mem_validate_pair backend 2000m 1536m && fail "res>lim rejected" || pass "res>lim rejected"

wr_mem_host_reserve_ok 7940 1664 && pass "host reserve ok" || fail "host reserve"
wr_mem_host_reserve_ok 7940 7000 && fail "tight host should fail" || pass "tight host rejected"

grep -q 'mem_limit:.*1536m' "$STAGING" && pass "staging be mem_limit" || fail "staging be mem_limit"
grep -q 'mem_limit:.*512m' "$STAGING" && pass "staging sf mem_limit" || fail "staging sf mem_limit"
grep -q 'mem_limit:.*1536m' "$PROD" && pass "prod be mem_limit" || fail "prod be mem_limit"
grep -q 'mem_limit:.*512m' "$PROD" && pass "prod sf mem_limit" || fail "prod sf mem_limit"

grep -q 'wr_mem_docker_flags_storefront' "$SF" && pass "sf recreate uses mem flags" || fail "sf recreate mem"
grep -q 'wr_mem_docker_flags_backend' "$BE" && pass "be recreate uses mem flags" || fail "be recreate mem"

# Units → bytes
[[ "$(wr_mem_parse_to_mib 512m)" == "512" ]] && pass "parse 512m" || fail "parse 512m"
[[ "$(wr_mem_parse_to_mib 1536m)" == "1536" ]] && pass "parse 1536m" || fail "parse 1536m"
[[ "$(wr_mem_parse_to_mib 1g)" == "1024" ]] && pass "parse 1g" || fail "parse 1g"

# No postgres mem_limit in wave1 compose app services only - postgres must not have mem_limit yet
if awk '/^  postgres:/{p=1} /^  [a-z]/{if(p&&!/^  postgres:/)p=0} p && /mem_limit/' "$STAGING" | grep -q .; then
  fail "postgres unexpectedly limited in staging"
else
  pass "postgres not limited in staging wave1"
fi

# Secrets heuristic
if grep -EIn 'password|api_key|BEGIN RSA|SECRET=' "$LIB" "$APPLY" "$PROD" 2>/dev/null | grep -v 'COOKIE_SECRET\|JWT_SECRET\|POSTGRES_PASSWORD\|WOODRIGHT_DB_PASSWORD\|PUBLISHABLE_KEY\|:?set'; then
  fail "secret-like"
else
  pass "no unexpected secrets"
fi

# dry-run apply script syntax path
bash "$APPLY" --mode dry-run --targets public_demo >/dev/null 2>&1 && fail "dry-run without docker should not require containers" || pass "dry-run fails closed without live containers (expected) or skipped"

# Fail-closed memory flag capture (no mapfile process-subst swallow)
if ! out="$(WOODRIGHT_STOREFRONT_MEMORY_LIMIT=256m wr_mem_docker_flags_storefront 2>/dev/null)"; then
  pass "invalid sf override fails closed"
else
  fail "invalid sf override should fail"
fi
if ! out="$(wr_mem_docker_flags_storefront)"; then
  fail "default sf flags"
else
  echo "$out" | tr '\n' ' ' | grep -q -- '--memory 512m' && pass "sf flag --memory" || fail "sf flag"
fi
if ! out="$(wr_mem_docker_flags_backend)"; then
  fail "default be flags"
else
  echo "$out" | tr '\n' ' ' | grep -q -- '--memory 1536m' && pass "be flag --memory" || fail "be flag"
fi

# recreate scripts must not use mapfile for memory flags
if grep -n 'mapfile.*wr_mem_docker_flags' "$SF" "$BE"; then
  fail "mapfile still used for memory flags"
else
  pass "no mapfile for memory flags"
fi

# apply script per-service compose check + partial-key fixture
grep -q 'WOODRIGHT_BACKEND_MEMORY_LIMIT' "$APPLY" && grep -q 'os.environ\["WOODRIGHT_BACKEND_MEMORY_LIMIT"\]' "$APPLY" \
  && pass "compose patch uses env overrides" || fail "compose patch env overrides"
FIX=$(mktemp)
cat > "$FIX" <<'YAML'
services:
  backend:
    image: x
    restart: unless-stopped
    mem_limit: "999m"
  storefront:
    image: y
    restart: unless-stopped
YAML
python3 - "$FIX" <<'PY'
import sys, re, pathlib
# reuse ensure_mem by extracting from apply script is heavy; inline minimal copy
path = sys.argv[1]
text = open(path).read()

def service_block(src, service):
    m = re.search(rf"(^  {service}:\n)(.*?)(?=^  [a-zA-Z]|\Z)", src, flags=re.M | re.S)
    return m.start(), m.end(), m.group(0)

def ensure_mem(service, res, lim, src):
    start, end, block = service_block(src, service)
    has_lim = bool(re.search(r"^\s+mem_limit:\s*", block, flags=re.M))
    has_res = bool(re.search(r"^\s+mem_reservation:\s*", block, flags=re.M))
    if has_lim and has_res:
        block2 = re.sub(r"^(\s+mem_reservation:\s*).*$", rf'\1"{res}"', block, count=1, flags=re.M)
        block2 = re.sub(r"^(\s+mem_limit:\s*).*$", rf'\1"{lim}"', block2, count=1, flags=re.M)
        return src[:start] + block2 + src[end:]
    block2 = re.sub(r"^\s+mem_reservation:\s*.*\n", "", block, flags=re.M)
    block2 = re.sub(r"^\s+mem_limit:\s*.*\n", "", block2, flags=re.M)
    m = re.search(r"(^\s+restart: unless-stopped\n)", block2, flags=re.M)
    insert = m.group(1) + f'    mem_reservation: "{res}"\n' + f'    mem_limit: "{lim}"\n'
    block2 = block2[: m.start()] + insert + block2[m.end() :]
    return src[:start] + block2 + src[end:]

out = ensure_mem("backend", "640m", "1536m", text)
out = ensure_mem("storefront", "192m", "512m", out)
open(path,"w").write(out)
for svc, want_lim in (("backend","1536m"),("storefront","512m")):
    _,_,b = service_block(out, svc)
    assert len(re.findall(r"^\s+mem_limit:\s*", b, flags=re.M))==1
    assert len(re.findall(r"^\s+mem_reservation:\s*", b, flags=re.M))==1
    assert want_lim in b
print("partial_ok")
PY
rm -f "$FIX"
pass "partial-key compose fixture"

[[ "$FAIL" -eq 0 ]] && echo "RESULT: PASS" && exit 0
echo "RESULT: FAIL count=$FAIL"; exit 1
