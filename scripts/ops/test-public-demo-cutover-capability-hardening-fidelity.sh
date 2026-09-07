#!/usr/bin/env bash
# Incident 20260907T112434Z: Traefik sibling mkstemp / rollback route / public 502.
# No live VM mutation. Models root-owned parent + caller-writable YAML without root.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMON="$ROOT/ops/lib/woodright-cutover-common.sh"
PY="$ROOT/ops/lib/woodright-public-demo-traefik-endpoint.py"
HC="$ROOT/ops/monitoring/woodright-health-check.sh"
FAILED=0
TMP="$(mktemp -d /tmp/wr-tf-cap-XXXXXX)"
trap 'chmod -R u+w "$TMP" 2>/dev/null || true; rm -rf "$TMP"' EXIT

pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; FAILED=$((FAILED + 1)); }

demo_yaml() {
  cat <<'EOF'
http:
  routers:
    woodright-api-https:
      rule: Host(`api.woodright-demo.ru`)
      service: woodright-backend
    woodright-sf-https:
      rule: Host(`woodright-demo.ru`)
      service: woodright-storefront
  services:
    woodright-backend:
      loadBalancer:
        servers:
          - url: "http://woodright-staging-backend:9000"
    woodright-storefront:
      loadBalancer:
        servers:
          - url: "http://woodright-staging-storefront:3002"
EOF
}

export WOODRIGHT_CUTOVER_ALLOW_TEST_PATHS=1
export WOODRIGHT_PUBLIC_DEMO_ENDPOINT_ALLOW_TEST_PATHS=1
# shellcheck source=../../ops/lib/woodright-cutover-common.sh
source "$COMMON"

PARENT="$TMP/traefik/dynamic"
mkdir -p "$PARENT"
YAML="$PARENT/woodright-demo.yml"
demo_yaml >"$YAML"
chmod 0644 "$YAML"
export WOODRIGHT_PUBLIC_DEMO_EDGE_RESOLVER_FILE="$YAML"

# --- incident topology: parent not writable, YAML is ---
chmod 0555 "$PARENT"
if [[ -w "$YAML" ]]; then
  pass "incident topology: YAML caller-writable"
else
  fail "incident topology: YAML not writable (fixture broken)"
fi
if [[ -w "$PARENT" ]]; then
  fail "incident topology: parent unexpectedly writable"
else
  pass "incident topology: parent not writable to caller"
fi

set +e
python3 "$PY" probe-atomic-write --file "$YAML" >"$TMP/probe-unpriv.json" 2>"$TMP/probe-unpriv.err"
PROBE_RC=$?
set -e
if [[ "$PROBE_RC" -ne 0 ]]; then
  pass "incident 20260907T112434Z: sibling mkstemp fails while YAML -w is true"
else
  fail "unprivileged probe unexpectedly passed: $(cat "$TMP/probe-unpriv.json")"
fi

cat >"$TMP/deny-sudo" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$TMP/deny-sudo"
export WOODRIGHT_TRAEFIK_ENDPOINT_SUDO="$TMP/deny-sudo"
unset WR_PUBLIC_DEMO_ENDPOINT_PRIVILEGED || true
set +e
wr_public_demo_require_endpoint_write_capability >"$TMP/cap-fail.out" 2>"$TMP/cap-fail.err"
CAP_RC=$?
set -e
if [[ "$CAP_RC" -ne 0 ]] && grep -q 'TRAEFIK_ENDPOINT_CAPABILITY_FAILED' "$TMP/cap-fail.err"; then
  pass "preflight detects capability FAIL before any container mutation"
else
  fail "capability preflight did not fail closed (rc=$CAP_RC)"
  cat "$TMP/cap-fail.err" || true
fi
AFTER_FAIL="$(sha256sum "$YAML" | awk '{print $1}')"
BEFORE_FAIL="$(sha256sum <<<"$(demo_yaml)" | awk '{print $1}')"
# Compare to file hash captured after fail (file should still be original demo yaml)
if grep -q 'woodright-staging-storefront:3002' "$YAML" && ! grep -q '10.0.1.' "$YAML"; then
  pass "failed preflight did not mutate active YAML"
else
  fail "failed preflight mutated YAML"
fi

# --- privileged capability pass via fake sudo that can write the parent ---
cat >"$TMP/fake-sudo" <<EOF
#!/usr/bin/env bash
set -euo pipefail
[[ "\${1:-}" == "-n" ]] && shift
chmod 0755 "$PARENT"
"\$@"
rc=\$?
chmod 0555 "$PARENT"
exit \$rc
EOF
chmod +x "$TMP/fake-sudo"
export WOODRIGHT_TRAEFIK_ENDPOINT_SUDO="$TMP/fake-sudo"
unset WR_PUBLIC_DEMO_ENDPOINT_PRIVILEGED || true
HASH_BEFORE="$(sha256sum "$YAML" | awk '{print $1}')"
set +e
wr_public_demo_require_endpoint_write_capability >"$TMP/cap-ok.out" 2>"$TMP/cap-ok.err"
CAP_OK_RC=$?
set -e
HASH_AFTER="$(sha256sum "$YAML" | awk '{print $1}')"
if [[ "$CAP_OK_RC" -eq 0 ]] && grep -q 'TRAEFIK_ENDPOINT_CAPABILITY_OK privileged=1' "$TMP/cap-ok.err"; then
  pass "privileged capability PASS uses the same sudo -n python path"
else
  fail "privileged capability did not pass (rc=$CAP_OK_RC)"
  cat "$TMP/cap-ok.err" || true
fi
if [[ "$HASH_BEFORE" == "$HASH_AFTER" ]]; then
  pass "privileged probe left YAML hash unchanged"
else
  fail "privileged probe mutated YAML"
fi
if [[ "${WR_PUBLIC_DEMO_ENDPOINT_PRIVILEGED:-}" == "1" ]]; then
  pass "forward path remembers privileged=1"
else
  fail "privileged flag not exported (have=${WR_PUBLIC_DEMO_ENDPOINT_PRIVILEGED:-empty})"
fi

# Forward apply + rollback restore through the same privileged python path
chmod 0755 "$PARENT"
python3 "$PY" rewrite --file "$YAML" --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null
chmod 0555 "$PARENT"
export WOODRIGHT_PUBLIC_DEMO_RESTORE_ENDPOINTS=1
export WR_PUBLIC_DEMO_ENDPOINT_PRIVILEGED=1
set +e
wr_public_demo_restore_traefik_hostnames >"$TMP/restore.out" 2>"$TMP/restore.err"
REST_RC=$?
set -e
if [[ "$REST_RC" -eq 0 ]] \
  && grep -q 'http://woodright-staging-storefront:3002' "$YAML" \
  && grep -q 'http://woodright-staging-backend:9000' "$YAML" \
  && ! grep -q '10.0.1.42' "$YAML" \
  && grep -q 'TRAEFIK_ENDPOINT_HOSTNAMES_RESTORED' "$TMP/restore.err"; then
  pass "rollback restore uses privileged path and restores hostnames"
else
  fail "rollback restore failed rc=$REST_RC yaml=$(cat "$YAML")"
  cat "$TMP/restore.err" || true
fi
if grep -q 'PAIR_ROLLBACK_PARTIAL' "$TMP/restore.err"; then
  fail "restore emitted PAIR_ROLLBACK_PARTIAL"
else
  pass "endpoint-capable restore is not PAIR_ROLLBACK_PARTIAL"
fi
unset WOODRIGHT_PUBLIC_DEMO_RESTORE_ENDPOINTS

# File metadata: mode/owner preserved across atomic replace
chmod 0755 "$PARENT"
chmod 0640 "$YAML"
OWNER_BEFORE="$(stat -f '%u:%g' "$YAML" 2>/dev/null || stat -c '%u:%g' "$YAML")"
MODE_BEFORE="$(stat -f '%Lp' "$YAML" 2>/dev/null || stat -c '%a' "$YAML")"
python3 "$PY" rewrite --file "$YAML" --sf-url "http://10.0.1.42:3002" --be-url "http://10.0.1.41:9000" >/dev/null
OWNER_AFTER="$(stat -f '%u:%g' "$YAML" 2>/dev/null || stat -c '%u:%g' "$YAML")"
MODE_AFTER="$(stat -f '%Lp' "$YAML" 2>/dev/null || stat -c '%a' "$YAML")"
if [[ "$OWNER_BEFORE" == "$OWNER_AFTER" && "$MODE_BEFORE" == "$MODE_AFTER" ]]; then
  pass "atomic write preserves owner/group/mode ($OWNER_AFTER mode=$MODE_AFTER)"
else
  fail "metadata drift before=$OWNER_BEFORE/$MODE_BEFORE after=$OWNER_AFTER/$MODE_AFTER"
fi
python3 "$PY" restore-hostnames --file "$YAML" >/dev/null
if grep -q '_restore_file_metadata' "$PY" && grep -q 'chown_restore_failed' "$PY"; then
  pass "root caller must restore preimage uid/gid (contract in writer)"
else
  fail "chown restore contract missing from atomic writer"
fi

# Public 502 cannot yield overall=ok
BIN="$TMP/bin"
mkdir -p "$BIN"
cat >"$BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cmd="${1:-}"; shift || true
case "$cmd" in
  inspect)
    echo runninghealthy
    ;;
  exec)
    if [[ "$*" == *pg_isready* ]]; then exit 0; fi
    if [[ "$*" == *SELECT\ 1* ]]; then echo 1; exit 0; fi
    if [[ "$*" == *pg_stat_activity* ]]; then echo 1; exit 0; fi
    if [[ "$*" == *redis-cli*ping* ]]; then echo PONG; exit 0; fi
    if [[ "$*" == *INFO\ memory* ]]; then echo used_memory_human:1M; exit 0; fi
    exit 0
    ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$BIN/docker"
cat >"$BIN/ss" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$BIN/ss"
cat >"$BIN/openssl" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
chmod +x "$BIN/openssl"

BUYER="https://woodright-demo.ru"
API="https://api.woodright-demo.ru"
FIXTURE_CODES="$(python3 -c '
import json
buyer="https://woodright-demo.ru"
api="https://api.woodright-demo.ru"
doc={}
for p in ["/", "/catalog", "/kids/catalog", "/robots.txt", "/sitemap.xml", "/products",
          "/product-static/products/oliver/OL-95-1_gallery_02.jpg"]:
    doc[buyer+p]="502"
doc[api+"/"]="502"
doc[api+"/health"]="502"
doc[api+"/store/regions"]="502"
print(json.dumps(doc))
')"
printf '%s\n' '{"owner":"Dokploy"}' >"$TMP/active.json"
printf '%s\n' '{"release_sha":"e76038bbf4b8c193dcc85f55910dde92429b382a"}' >"$TMP/expected.json"
set +e
PATH="$BIN:$PATH" \
  WOODRIGHT_MONITOR_WRITE=0 \
  WOODRIGHT_FIXTURE_BE_DISCOVERY_OK=1 \
  WOODRIGHT_FIXTURE_SF_DISCOVERY_OK=1 \
  WOODRIGHT_BE_CONTAINER=woodright-staging-backend \
  WOODRIGHT_SF_CONTAINER=woodright-staging-storefront \
  WOODRIGHT_FIXTURE_BACKUP_AGE_HOURS=1 \
  WOODRIGHT_FIXTURE_DISK_PCT=10 \
  WOODRIGHT_BUYER_HOST="$BUYER" \
  WOODRIGHT_API_HOST="$API" \
  WOODRIGHT_FIXTURE_HTTP_CODES_JSON="$FIXTURE_CODES" \
  WOODRIGHT_ACTIVE_OWNER="$TMP/active.json" \
  WOODRIGHT_EXPECTED_RELEASE="$TMP/expected.json" \
  WOODRIGHT_MONITOR_STATE="$TMP/hc-state" \
  WOODRIGHT_MONITOR_HISTORY="$TMP/hc-hist" \
  bash "$HC" --environment public_demo >"$TMP/hc-502.out" 2>"$TMP/hc-502.err"
HC_RC=$?
set -e
if grep -q 'overall=critical' "$TMP/hc-502.out" "$TMP/hc-502.err" \
  && grep -q '"name": "buyer/"' <<<"$(cat "$TMP/hc-502.out")" ; then
  :
fi
OVERALL_502="$(python3 -c 'import json,sys,re
text=open(sys.argv[1]).read()+"\n"+open(sys.argv[2]).read()
# JSON dump is on stdout
raw=open(sys.argv[1]).read()
start=raw.find("{")
if start<0:
  print("missing"); raise SystemExit
obj=json.loads(raw[start:])
print(obj.get("overall",""))
checks=obj.get("checks") or []
print("buyer_fail="+str(any(c.get("name")=="buyer/" and c.get("status")=="fail" and c.get("severity")=="critical" for c in checks)))
print("api_fail="+str(any(c.get("name")=="api_health" and c.get("status")=="fail" and c.get("severity")=="critical" for c in checks)))
' "$TMP/hc-502.out" "$TMP/hc-502.err" 2>/dev/null || echo missing)"
if printf '%s\n' "$OVERALL_502" | grep -q '^critical' \
  && printf '%s\n' "$OVERALL_502" | grep -q 'buyer_fail=True' \
  && printf '%s\n' "$OVERALL_502" | grep -q 'api_fail=True'; then
  pass "public buyer+API 502 => monitor overall=critical"
else
  fail "502 monitor not critical: $OVERALL_502 rc=$HC_RC"
  head -c 2000 "$TMP/hc-502.out" || true
fi
if printf '%s\n' "$OVERALL_502" | grep -q '^ok'; then
  fail "502 monitor reported overall=ok"
fi

# Cutover public-edge verify fails on HTTP 502 even if containers would be healthy
cat >"$TMP/curl-502" <<'EOF'
#!/usr/bin/env bash
printf 'HTTP/1.1 502 Bad Gateway\r\n\r\n' >"$2"
echo 502
EOF
chmod +x "$TMP/curl-502"
export WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET="$TMP/curl-502"
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_TIMEOUT_S=0
export WOODRIGHT_PUBLIC_DEMO_EDGE_SETTLE_INTERVAL_S=0
export WOODRIGHT_BUYER_HOST="https://woodright-demo.ru"
set +e
wr_public_demo_wait_buyer_edge e76038bbf4b8c193dcc85f55910dde92429b382a public_demo public_demo_db \
  "" "$TMP/edge.hdr" >/dev/null 2>"$TMP/edge.err"
EDGE_RC=$?
set -e
if [[ "$EDGE_RC" -ne 0 && "${WR_PUBLIC_DEMO_EDGE_LAST_HTTP:-}" == "502" ]]; then
  pass "cutover buyer verify fails on HTTP 502"
else
  fail "buyer wait accepted 502 rc=$EDGE_RC http=${WR_PUBLIC_DEMO_EDGE_LAST_HTTP:-empty}"
fi
unset WOODRIGHT_PUBLIC_DEMO_EDGE_HTTP_GET

# Static: pair rollback requires hostname restore for PAIR_ROLLBACK_OK
if grep -q 'endpoint_ok' "$COMMON" && grep -q 'PAIR_ROLLBACK_OK' "$COMMON"; then
  pass "pair rollback success requires Traefik hostname restore"
else
  fail "rollback endpoint_ok contract missing"
fi
if grep -q 'sudo -n python3' "$COMMON" && grep -q 'WR_PUBLIC_DEMO_ENDPOINT_PRIVILEGED' "$COMMON"; then
  pass "narrow sudo -n python3 is the privileged endpoint path"
else
  fail "privileged python prefix missing"
fi
if grep -q 'IPs are ephemeral' "$COMMON"; then
  pass "ephemeral IP vs hostname restore decision is documented"
else
  fail "IP/hostname contract comment missing"
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "FAILED=$FAILED"
  exit 1
fi
echo "ALL_PASS"
exit 0
