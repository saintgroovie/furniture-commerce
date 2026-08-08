#!/usr/bin/env bash
# Fidelity: profile-aware buyer_hsts + api_x_robots (private N/A vs public strict).
# Invokes real policy helpers and monitor check path via fixtures - not string-only greps.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HC="$ROOT/ops/monitoring/woodright-health-check.sh"
LIB="$ROOT/ops/lib/woodright-monitor-header-policy.sh"
FAIL=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

[[ -f "$HC" && -f "$LIB" ]] || { echo "missing monitor/policy files"; exit 2; }
# shellcheck source=../../ops/lib/woodright-monitor-header-policy.sh
source "$LIB"

expect_policy() {
  local kind="$1" exposure="$2" url="$3" want_action="$4" want_reason_substr="$5"
  local got action reason
  if [[ "$kind" == "hsts" ]]; then
    got="$(wr_monitor_buyer_hsts_policy "$exposure" "$url")"
  else
    got="$(wr_monitor_api_x_robots_policy "$exposure" "$url")"
  fi
  action="${got%%$'\t'*}"
  reason="${got#*$'\t'}"
  if [[ "$action" == "$want_action" && "$reason" == *"$want_reason_substr"* ]]; then
    pass "$kind policy $exposure $url -> $action ($reason)"
  else
    fail "$kind policy $exposure $url expected action=$want_action reason~=$want_reason_substr got=$got"
  fi
}

echo "=== URL parse ==="
for url in \
  "http://127.0.0.1:3200" \
  "http://localhost:3200" \
  "http://[::1]:3200" \
  "https://woodright-demo.ru" \
  "https://api.woodright-demo.ru" \
  "https://example.com:8443"
do
  ok="$(wr_monitor_parse_http_url "$url" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ok"])')"
  [[ "$ok" == "True" ]] && pass "parse ok $url" || fail "parse failed $url"
done
bad="$(wr_monitor_parse_http_url "not a url" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ok"])')"
[[ "$bad" == "False" ]] && pass "parse rejects malformed" || fail "parse should reject malformed"
empty="$(wr_monitor_parse_http_url "" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ok"])')"
[[ "$empty" == "False" ]] && pass "parse rejects empty" || fail "parse should reject empty"
badport="$(wr_monitor_parse_http_url "http://example.com:bad" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ok"])')"
[[ "$badport" == "False" ]] && pass "parse rejects malformed port" || fail "parse should reject malformed port"
sanitized="$(wr_monitor_sanitize_http_target 'https://user:pass@example.com:443/secret?token=1')"
[[ "$sanitized" == "https://example.com:443/" ]] && pass "sanitize strips userinfo/query" || fail "sanitize failed: $sanitized"
expect_policy hsts private "http://example.com:bad" fail buyer_target_unparseable
expect_policy api public "http://example.com:bad" fail api_target_unparseable

echo "=== buyer_hsts policy matrix ==="
expect_policy hsts private "http://127.0.0.1:3200" not_applicable private_http_no_tls_edge
expect_policy hsts private "http://localhost:3200" not_applicable private_http_no_tls_edge
expect_policy hsts private "http://[::1]:3200" not_applicable private_http_no_tls_edge
expect_policy hsts private "https://private.example" probe https_edge_hsts_required
expect_policy hsts public "https://example.com" probe https_edge_hsts_required
expect_policy hsts public "http://example.com" fail public_buyer_https_required
expect_policy hsts private "not://bad" fail buyer_target_unparseable
expect_policy hsts private "http://woodright.example" fail buyer_exposure_target_inconsistent

echo "=== api_x_robots policy matrix ==="
expect_policy api private "http://127.0.0.1:9200" not_applicable private_loopback_api_not_publicly_indexable
expect_policy api private "http://localhost:9200" not_applicable private_loopback_api_not_publicly_indexable
expect_policy api private "http://[::1]:9200" not_applicable private_loopback_api_not_publicly_indexable
# Codex P1 / policy B: private HTTPS loopback is NOT eligible for N/A
expect_policy api private "https://127.0.0.1:9200" probe private_https_loopback_x_robots_required
expect_policy api private "https://localhost:9200" probe private_https_loopback_x_robots_required
expect_policy api private "https://[::1]:9200" probe private_https_loopback_x_robots_required
expect_policy api private "https://api.example.com" fail api_exposure_target_inconsistent
expect_policy api public "https://api.example.com" probe public_api_x_robots_required
expect_policy api public "http://127.0.0.1:9200" fail api_exposure_target_inconsistent
expect_policy api public ":::bad" fail api_target_unparseable
expect_policy api public "https://api.woodright-demo.ru" probe public_api_x_robots_required

echo "=== add_check overall aggregation (not_applicable) ==="
AGG_OVERALL="ok"
AGG_EXIT=0
agg_add() {
  local severity="$2" status="$3"
  if [[ "$status" == "pass" || "$status" == "not_applicable" ]]; then
    return 0
  fi
  if [[ "$severity" == "critical" ]]; then
    AGG_OVERALL="critical"
    AGG_EXIT=2
  elif [[ "$severity" == "warning" && "$AGG_OVERALL" == "ok" ]]; then
    AGG_OVERALL="warning"
    [[ $AGG_EXIT -eq 0 ]] && AGG_EXIT=1
  fi
}
agg_add x info not_applicable "reason=private_http_no_tls_edge"
agg_add y info not_applicable "reason=private_loopback_api_not_publicly_indexable"
[[ "$AGG_OVERALL" == "ok" && "$AGG_EXIT" -eq 0 ]] && pass "two N/A do not raise overall" || fail "N/A raised overall=$AGG_OVERALL exit=$AGG_EXIT"
agg_add z warning fail "missing"
[[ "$AGG_OVERALL" == "warning" && "$AGG_EXIT" -eq 1 ]] && pass "unrelated warning still raises overall" || fail "warning aggregation broken"
AGG_OVERALL="ok"; AGG_EXIT=0
agg_add a info not_applicable "x"
agg_add b warning fail "missing;reason=https_edge_hsts_required"
[[ "$AGG_OVERALL" == "warning" ]] && pass "public missing HSTS still warning" || fail "missing HSTS severity lost"
AGG_OVERALL="ok"; AGG_EXIT=0
agg_add a info pass "digest match"
agg_add b warning fail "mismatch"
[[ "$AGG_OVERALL" == "warning" ]] && pass "digest mismatch still raises warning" || fail "digest aggregation broken"

echo "=== monitor integration via fixtures (no live public network) ==="
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
mkdir -p "$TMP/backup-root/manifests"
BIN="$TMP/bin"
mkdir -p "$BIN"

cat >"$BIN/docker" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "inspect" ]]; then
  name="${2:-}"
  role=backend
  [[ "$name" == *storefront* ]] && role=storefront
  img="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  [[ "$role" == storefront ]] && img="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  python3 - "$name" "$role" "$img" <<'PY'
import json,sys
name,role,img=sys.argv[1:4]
print(json.dumps([{
  "Id": "id-"+role,
  "Name": "/"+name,
  "Image": img,
  "RestartCount": 0,
  "State": {"Status": "running", "Health": {"Status": "healthy"}},
  "Config": {"Labels": {
      "org.opencontainers.image.revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "com.docker.compose.project": "woodright-production",
      "com.docker.compose.service": role,
  }, "Image": "x"},
  "HostConfig": {"PortBindings": {
    ("3002/tcp" if role=="storefront" else "9000/tcp"): [{"HostIp":"127.0.0.1","HostPort":"3200" if role=="storefront" else "9200"}]
  }},
  "Mounts": [{"Type":"volume","Name":"woodright-production_woodright-production_media","Destination":"/server/static"}],
  "NetworkSettings": {"Networks": {"dokploy-network": {}}, "Ports": {}},
  "RepoDigests": [f"ghcr.io/saintgroovie/woodright-{role}@"+img],
}]))
PY
  exit 0
fi
exit 0
EOF
chmod +x "$BIN/docker"

cat >"$BIN/curl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *"%{http_code}"* ]]; then
  if [[ "$*" == *sitemap.xml* ]]; then
    echo "404"
    exit 0
  fi
  echo "200"
  exit 0
fi
echo "HTTP/1.1 200 OK"
exit 0
EOF
chmod +x "$BIN/curl"

# Avoid live TLS/network: openssl shim for tls_expiry probe.
cat >"$BIN/openssl" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == *x509* && "$*" == *enddate* ]]; then
  echo "notAfter=Dec 31 23:59:59 2099 GMT"
  exit 0
fi
# s_client path: emit enough for the pipe to x509 shim when chained externally
exit 0
EOF
chmod +x "$BIN/openssl"

rewrite_profile_hosts() {
  local conf="$1" buyer="$2" api="$3"
  python3 - "$conf" "$buyer" "$api" <<'PY'
from pathlib import Path
import sys
path, buyer, api = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = []
for line in path.read_text().splitlines():
    if line.startswith("WOODRIGHT_BUYER_HOST="):
        lines.append(f"WOODRIGHT_BUYER_HOST={buyer}")
    elif line.startswith("WOODRIGHT_API_HOST="):
        lines.append(f"WOODRIGHT_API_HOST={api}")
    else:
        lines.append(line)
path.write_text("\n".join(lines) + "\n")
PY
}

run_monitor_case() {
  local name="$1"
  local env_name="$2"
  local buyer="$3"
  local api="$4"
  local hdr_json="$5"
  local expect_hsts_status="$6"
  local expect_api_status="$7"
  local out profile_dir
  out="$(mktemp "$TMP/out.XXXXXX")"
  profile_dir="$(mktemp -d "$TMP/profiles.XXXXXX")"
  cp "$ROOT/ops/config/runtime-environments/"*.conf "$profile_dir/"
  rewrite_profile_hosts "$profile_dir/${env_name}.conf" "$buyer" "$api"
  # macOS: realpath may resolve /var -> /private/var; normalize for profile allowlist.
  profile_dir="$(cd "$profile_dir" && pwd -P)"

  set +e
  PATH="$BIN:$PATH" \
  WOODRIGHT_MONITOR_WRITE=0 \
  WOODRIGHT_ENV_PROFILE_DIR="$profile_dir" \
  WOODRIGHT_FIXTURE_BE_DISCOVERY_OK=1 \
  WOODRIGHT_FIXTURE_SF_DISCOVERY_OK=1 \
  WOODRIGHT_BE_CONTAINER=woodright-production-backend \
  WOODRIGHT_SF_CONTAINER=woodright-production-storefront \
  WOODRIGHT_FIXTURE_RESPONSE_HEADERS_JSON="$hdr_json" \
  WOODRIGHT_REQUIRE_EXPECTED_DIGEST=0 \
  WOODRIGHT_FIXTURE_BACKUP_AGE_HOURS=1 \
  WOODRIGHT_FIXTURE_DISK_PCT=10 \
  WOODRIGHT_BACKUP_ROOT="$TMP/backup-root" \
  WOODRIGHT_PG_CONTAINER=skip-pg \
  WOODRIGHT_REDIS_CONTAINER=skip-redis \
  bash "$HC" --environment "$env_name" >"$out" 2>/dev/null
  set -e

  if python3 - "$out" "$name" "$expect_hsts_status" "$expect_api_status" <<'PY'
import json,sys
path,name,exp_h,exp_a=sys.argv[1:5]
try:
  doc=json.load(open(path))
except Exception as e:
  print(f"PARSE_FAIL {name}: {e}")
  raise SystemExit(1)
checks={c["name"]:c for c in doc.get("checks") or []}
h=checks.get("buyer_hsts") or {}
a=checks.get("api_x_robots") or {}
ok = h.get("status")==exp_h and a.get("status")==exp_a
print(("OK" if ok else "FAIL"), name, "overall="+str(doc.get("overall")),
      "hsts="+str(h.get("status")), "api="+str(a.get("status")),
      "detail_h="+str(h.get("detail","")), "detail_a="+str(a.get("detail","")))
if not ok:
  print("got_hsts", h)
  print("got_api", a)
raise SystemExit(0 if ok else 1)
PY
  then
    pass "$name statuses match ($expect_hsts_status / $expect_api_status)"
  else
    fail "$name status mismatch"
  fi

  if [[ "$expect_hsts_status" == "not_applicable" ]]; then
    if grep -q 'not_applicable' "$out" && grep -q 'private_http_no_tls_edge' "$out"; then
      pass "$name N/A visible for buyer_hsts"
    else
      fail "$name buyer_hsts N/A not visible"
    fi
  fi
  if [[ "$expect_api_status" == "not_applicable" ]]; then
    if grep -q 'private_loopback_api_not_publicly_indexable' "$out"; then
      pass "$name N/A visible for api_x_robots"
    else
      fail "$name api N/A not visible"
    fi
  fi
  if [[ "$expect_hsts_status" == "not_applicable" && "$expect_api_status" == "not_applicable" ]]; then
    if python3 - "$out" <<'PY'
import json,sys
doc=json.load(open(sys.argv[1]))
bad=[c for c in doc.get("checks") or [] if c.get("name") in ("buyer_hsts","api_x_robots") and c.get("status")=="fail"]
raise SystemExit(1 if bad else 0)
PY
    then
      pass "$name N/A checks are not fail"
    else
      fail "$name N/A checks unexpectedly failed"
    fi
  fi
}

EMPTY_HDR='{}'
HSTS_PRESENT='{"https://private.example/":{"strict-transport-security":"max-age=31536000"},"https://example.com/":{"strict-transport-security":"max-age=31536000"},"https://woodright-demo.ru/":{"strict-transport-security":"max-age=31536000","x-robots-tag":"noindex, nofollow"},"https://api.woodright-demo.ru/":{"x-robots-tag":"noindex, nofollow"},"https://api.example.com/":{"x-robots-tag":"noindex"}}'
HSTS_ABSENT_HTTPS='{"https://private.example/":{},"https://example.com/":{},"https://api.example.com/":{},"https://api.woodright-demo.ru/":{},"https://woodright-demo.ru/":{"x-robots-tag":"noindex","strict-transport-security":"max-age=1"}}'

run_monitor_case "private_loopback_na" production \
  "http://127.0.0.1:3200" "http://127.0.0.1:9200" "$EMPTY_HDR" \
  not_applicable not_applicable

# Private HTTPS loopback API must probe and fail when X-Robots absent (not N/A).
run_monitor_case "private_https_loopback_api_not_na" production \
  "http://127.0.0.1:3200" "https://127.0.0.1:9200" "$EMPTY_HDR" \
  not_applicable fail

run_monitor_case "private_https_hsts_present" production \
  "https://private.example" "http://127.0.0.1:9200" "$HSTS_PRESENT" \
  pass not_applicable

run_monitor_case "private_https_hsts_absent" production \
  "https://private.example" "http://127.0.0.1:9200" "$HSTS_ABSENT_HTTPS" \
  fail not_applicable

run_monitor_case "public_demo_headers_present" public_demo \
  "https://woodright-demo.ru" "https://api.woodright-demo.ru" "$HSTS_PRESENT" \
  pass pass

run_monitor_case "public_demo_api_x_robots_absent" public_demo \
  "https://woodright-demo.ru" "https://api.woodright-demo.ru" "$HSTS_ABSENT_HTTPS" \
  pass fail

run_monitor_case "public_http_buyer_not_na" public_demo \
  "http://example.com" "https://api.woodright-demo.ru" "$HSTS_PRESENT" \
  fail pass

echo "=== regression source gates ==="
grep -q 'REQUIRE_EXPECTED_DIGEST\|expected_digest\|digest_sf\|digest_be' "$HC" \
  && pass "digest authority checks still present" || fail "digest authority checks missing"
# Keep the exact env token used by production drop-in / docs if present in repo helpers.
if grep -R -n --include='*.sh' --include='*.conf' --include='*.service' --include='*.md' \
  'WOODRIGHT_REQUIRE_EXPECTED_DIGEST' "$ROOT/ops" >/dev/null 2>&1; then
  pass "WOODRIGHT_REQUIRE_EXPECTED_DIGEST still referenced in ops"
else
  fail "WOODRIGHT_REQUIRE_EXPECTED_DIGEST disappeared from ops"
fi
grep -q 'not_applicable' "$HC" && pass "not_applicable status present" || fail "missing not_applicable"
grep -q 'wr_monitor_buyer_hsts_policy' "$HC" && pass "hsts policy wired" || fail "hsts policy not wired"
grep -q 'wr_monitor_api_x_robots_policy' "$HC" && pass "api policy wired" || fail "api policy not wired"
if grep -n '\[\[ -n "$HSTS" \]\] && add_check "buyer_hsts"' "$HC" >/dev/null; then
  fail "old unconditional buyer_hsts one-liner still present"
else
  pass "old unconditional buyer_hsts one-liner removed"
fi
if grep -n '\[\[ "$API_XR" == \*noindex\* \]\] && add_check "api_x_robots"' "$HC" >/dev/null; then
  fail "old unconditional api_x_robots one-liner still present"
else
  pass "old unconditional api_x_robots one-liner removed"
fi
if grep -nE 'skip_hsts|skip_api_x_robots|TODO.*hsts' "$HC" >/dev/null; then
  fail "unmanaged skip token found"
else
  pass "no unmanaged skip tokens"
fi

echo "=== secret scan (scoped paths) ==="
if git -C "$ROOT" diff -- ops/monitoring/woodright-health-check.sh ops/lib/woodright-monitor-header-policy.sh scripts/ops/test-monitor-profile-aware-header-fidelity.sh \
  | grep -Ei 'password|secret|api[_-]?key|authorization:|BEGIN (RSA |OPENSSH )?PRIVATE' >/dev/null; then
  fail "secret-like content in diff"
else
  pass "no secret-like content in scoped diff"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAILED=$FAIL"
  exit 1
fi
echo "ALL_PASS"
exit 0
