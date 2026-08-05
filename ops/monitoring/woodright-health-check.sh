#!/usr/bin/env bash
# Woodright read-only health check. NEVER mutates runtime, firewall, backups, or Git.
set -Eeuo pipefail

STATE_DIR="${WOODRIGHT_MONITOR_STATE:-/srv/woodright/monitoring/state}"
HISTORY_DIR="${WOODRIGHT_MONITOR_HISTORY:-/srv/woodright/monitoring/history}"
ACTIVE_OWNER="${WOODRIGHT_ACTIVE_OWNER:-/srv/woodright/runtime-ownership/ACTIVE_OWNER.json}"
EXPECTED_RELEASE="${WOODRIGHT_EXPECTED_RELEASE:-/srv/woodright/runtime-ownership/EXPECTED_RELEASE.json}"
BACKUP_ROOT="${WOODRIGHT_BACKUP_ROOT:-/srv/woodright/backups/automated}"
BUYER_HOST="${WOODRIGHT_BUYER_HOST:-https://woodright-demo.ru}"
API_HOST="${WOODRIGHT_API_HOST:-https://api.woodright-demo.ru}"
# Capture explicit media volume BEFORE discovery lib applies its staging default.
_WR_MEDIA_VOLUME_PRESET="${WOODRIGHT_MEDIA_VOLUME-__unset__}"
# Resolve SF/BE via discovery (explicit WOODRIGHT_*_CONTAINER still honored).
# Fail-closed: no hardcoded ephemeral compose names; discovery runs after add_check exists.
OPS_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/woodright-runtime-discovery.sh"
# shellcheck source=../lib/woodright-runtime-discovery.sh
source "$OPS_LIB"
HP_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/woodright-host-publish.sh"
# shellcheck source=../lib/woodright-host-publish.sh
source "$HP_LIB"
ENV_PROFILE_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/woodright-environment-profile.sh"

# Optional: --environment <name> loads profile for host-publish + path pins.
# Remaining monitor behavior stays env-driven for backward compatibility.
if [[ "${1:-}" == "--environment" || "${1:-}" == --environment=* ]]; then
  # shellcheck source=../lib/woodright-environment-profile.sh
  source "$ENV_PROFILE_LIB"
  wr_require_environment_from_args "$@" || exit 2
  ACTIVE_OWNER="${WOODRIGHT_ACTIVE_OWNER}"
  EXPECTED_RELEASE="${WOODRIGHT_EXPECTED_RELEASE}"
  BUYER_HOST="${WOODRIGHT_BUYER_HOST}"
  API_HOST="${WOODRIGHT_API_HOST}"
  export WOODRIGHT_BE_CONTAINER="${WOODRIGHT_BE_CONTAINER:-$WOODRIGHT_BE_CONTAINER_DEFAULT}"
  export WOODRIGHT_SF_CONTAINER="${WOODRIGHT_SF_CONTAINER:-$WOODRIGHT_SF_CONTAINER_DEFAULT}"
  # Rebind mutable paths from profile (never inherit demo defaults after profile load).
  STATE_DIR="${WOODRIGHT_MONITOR_STATE:-${WOODRIGHT_MONITOR_STATE_ROOT:-$STATE_DIR}}"
  HISTORY_DIR="${WOODRIGHT_MONITOR_HISTORY:-${WOODRIGHT_MONITOR_HISTORY_ROOT:-$HISTORY_DIR}}"
  BACKUP_ROOT="${WOODRIGHT_BACKUP_ROOT:-$BACKUP_ROOT}"
  if [[ -n "${WOODRIGHT_PG_CONTAINER_PREFIX:-}" ]]; then
    export WOODRIGHT_PG_CONTAINER="${WOODRIGHT_PG_CONTAINER:-${WOODRIGHT_PG_CONTAINER_PREFIX}}"
  fi
  if [[ -n "${WOODRIGHT_REDIS_CONTAINER_DEFAULT:-}" ]]; then
    export WOODRIGHT_REDIS_CONTAINER="${WOODRIGHT_REDIS_CONTAINER:-${WOODRIGHT_REDIS_CONTAINER_DEFAULT}}"
  fi
  if [[ -n "${WOODRIGHT_DB_NAME:-}" ]]; then
    export WOODRIGHT_MONITOR_PG_DB="${WOODRIGHT_DB_NAME}"
  fi
  if [[ -n "${WOODRIGHT_DB_USER:-}" ]]; then
    export WOODRIGHT_MONITOR_PG_USER="${WOODRIGHT_DB_USER}"
  fi
elif [[ "$_WR_MEDIA_VOLUME_PRESET" == "__unset__" ]]; then
  # No profile and no explicit media volume: do not inherit discovery's staging default.
  unset WOODRIGHT_MEDIA_VOLUME || true
fi

SF_CONTAINER=""
BE_CONTAINER=""
SF_DISCOVERY_OK=0
BE_DISCOVERY_OK=0
PG_CONTAINER="${WOODRIGHT_PG_CONTAINER:-woodright-stack-3dsdhd-postgres-1}"
REDIS_CONTAINER="${WOODRIGHT_REDIS_CONTAINER:-woodright-stack-3dsdhd-redis-1}"
MONITOR_PG_DB="${WOODRIGHT_MONITOR_PG_DB:-woodright_staging}"
# Profile path: WOODRIGHT_DB_USER is required (fail-closed). Legacy no-profile path keeps
# public_demo-compatible defaults only; never invent a shared "woodright" role for production.
MONITOR_PG_USER="${WOODRIGHT_MONITOR_PG_USER:-}"
DISK_WARN="${WOODRIGHT_DISK_WARN_PCT:-75}"
DISK_CRIT="${WOODRIGHT_DISK_CRIT_PCT:-85}"
INODE_WARN="${WOODRIGHT_INODE_WARN_PCT:-75}"
INODE_CRIT="${WOODRIGHT_INODE_CRIT_PCT:-90}"
BACKUP_WARN_H="${WOODRIGHT_BACKUP_WARN_HOURS:-30}"
BACKUP_CRIT_H="${WOODRIGHT_BACKUP_CRIT_HOURS:-48}"
# Fixture overrides for failure simulation (tests only)
FIXTURE_DIGEST="${WOODRIGHT_FIXTURE_EXPECTED_DIGEST:-}"
FIXTURE_BACKUP_AGE_H="${WOODRIGHT_FIXTURE_BACKUP_AGE_HOURS:-}"
FIXTURE_DISK_PCT="${WOODRIGHT_FIXTURE_DISK_PCT:-}"
FIXTURE_MEDIA_PATH="${WOODRIGHT_FIXTURE_MEDIA_MISSING:-}"
FIXTURE_TLS_HOST="${WOODRIGHT_FIXTURE_TLS_HOST:-}"
FIXTURE_HOST_PUBLISH_JSON="${WOODRIGHT_FIXTURE_HOST_PUBLISH_JSON:-}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
# Authoritative monitor writes are root-only by default. Unprivileged runs
# (e.g. pair cutover dry-run) must not overwrite last-status.json with false
# critical when backup manifests are root:root 0700.
WR_MONITOR_WRITE="${WOODRIGHT_MONITOR_WRITE:-}"
if [[ -z "$WR_MONITOR_WRITE" ]]; then
  if [[ "$(id -u)" -eq 0 ]]; then
    WR_MONITOR_WRITE=1
  else
    WR_MONITOR_WRITE=0
  fi
fi
if [[ "$WR_MONITOR_WRITE" == "1" ]]; then
  mkdir -p "$STATE_DIR" "$HISTORY_DIR"
  # State dir must be traversable by operators so cutover can read last-status.json
  # without sudo. History stays private.
  chmod 0755 "$STATE_DIR" 2>/dev/null || true
  chmod 0700 "$HISTORY_DIR" 2>/dev/null || true
fi

CHECKS_JSON="[]"
OVERALL="ok"
EXIT_CODE=0

add_check() {
  local name="$1" severity="$2" status="$3" detail="$4"
  CHECKS_JSON=$(python3 -c '
import json,sys
arr=json.loads(sys.argv[1])
arr.append({"name":sys.argv[2],"severity":sys.argv[3],"status":sys.argv[4],"detail":sys.argv[5]})
print(json.dumps(arr))
' "$CHECKS_JSON" "$name" "$severity" "$status" "$detail")
  if [[ "$status" != "pass" ]]; then
    if [[ "$severity" == "critical" ]]; then
      OVERALL="critical"
      EXIT_CODE=2
    elif [[ "$severity" == "warning" && "$OVERALL" == "ok" ]]; then
      OVERALL="warning"
      [[ $EXIT_CODE -eq 0 ]] && EXIT_CODE=1
    fi
  fi
}

curl_code() {
  local url="$1"
  curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || echo "000"
}

curl_hdr() {
  local url="$1" hdr="$2"
  curl -sSI --max-time 15 "$url" 2>/dev/null | awk -v h="$(echo "$hdr" | tr '[:upper:]' '[:lower:]')" '
    BEGIN{IGNORECASE=1}
    tolower($0) ~ "^"h":" {sub(/^[^:]+:[ \t]*/,""); gsub(/\r/,""); print; exit}
  '
}

# --- DISCOVERY (no command-substitution; preserve WR_DISCOVERY_VERDICT) ---
# Call functions in-shell; never fall back to unvalidated hardcoded names.
# Test-only: WOODRIGHT_FIXTURE_BE_DISCOVERY_OK=1 skips live discovery (media unit tests).

# public_production fail-closed contracts (path isolation, provisioned, launch gates)
if [[ "${WOODRIGHT_ENVIRONMENT:-}" == "public_production" ]]; then
  ISO_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/woodright-ops-path-isolation.sh"
  ALERT_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/woodright-alert-contract.sh"
  # shellcheck source=../lib/woodright-ops-path-isolation.sh
  source "$ISO_LIB"
  # shellcheck source=../lib/woodright-alert-contract.sh
  source "$ALERT_LIB"
  if wr_assert_public_production_path_isolation; then
    add_check "path_isolation" info pass "public_production_isolated"
  else
    add_check "path_isolation" critical fail "shared_or_invalid_paths"
  fi
  if [[ "${WOODRIGHT_ENVIRONMENT_PROVISIONED:-0}" == "1" ]]; then
    add_check "environment_provisioned" info pass "provisioned"
  else
    add_check "environment_provisioned" critical fail "unprovisioned_fail_closed"
  fi
  case "${WOODRIGHT_LEGAL_CONTENT_STATUS:-}" in
    approved) add_check "legal_status" info pass "approved" ;;
    owner_review|draft|"") add_check "legal_status" critical fail "status=${WOODRIGHT_LEGAL_CONTENT_STATUS:-unset}" ;;
    *) add_check "legal_status" critical fail "status=${WOODRIGHT_LEGAL_CONTENT_STATUS}" ;;
  esac
  if [[ "${WOODRIGHT_PAYMENT_DECISION_STATUS:-pending}" == "accepted_manual" \
    && "${WOODRIGHT_PAYMENT_MODE:-}" == "manual_invoice" ]]; then
    add_check "payment_decision" info pass "manual_invoice+accepted_manual"
  else
    add_check "payment_decision" critical fail "mode=${WOODRIGHT_PAYMENT_MODE:-unset};status=${WOODRIGHT_PAYMENT_DECISION_STATUS:-pending}"
  fi
  if [[ "${WOODRIGHT_NOTIFICATION_DECISION_STATUS:-pending}" == "accepted" ]]; then
    add_check "notification_decision" info pass "accepted"
  else
    add_check "notification_decision" critical fail "status=${WOODRIGHT_NOTIFICATION_DECISION_STATUS:-pending}"
  fi
  if wr_alert_assert_public_production_destination 2>/dev/null; then
    add_check "alert_destination" info pass "configured"
  else
    add_check "alert_destination" critical fail "missing_or_invalid"
  fi
  # When unprovisioned, skip live discovery/HTTP against missing runtime; still emit report.
  if [[ "${WOODRIGHT_ENVIRONMENT_PROVISIONED:-0}" != "1" && "${WOODRIGHT_MONITOR_FORCE_LIVE:-0}" != "1" ]]; then
    add_check "runtime_identity" critical fail "skipped_unprovisioned"
    # Jump to write outputs with accumulated critical checks
    SF_IMG="unprovisioned"
    BE_IMG="unprovisioned"
    OUT_JSON="$STATE_DIR/last-status.json"
    OUT_TXT="$STATE_DIR/last-status.txt"
    HIST="$HISTORY_DIR/status-${TS}.json"
    if [[ "$WR_MONITOR_WRITE" != "1" ]]; then
      python3 - "$TS" "$OVERALL" "$EXIT_CODE" "$CHECKS_JSON" "$SF_IMG" "$BE_IMG" <<'PY'
import json, sys
ts, overall, code, checks, sf, be = sys.argv[1:]
obj = {
  "timestamp_utc": ts,
  "overall": overall,
  "exit_code": int(code),
  "storefront_image": sf,
  "backend_image": be,
  "environment": "public_production",
  "checks": json.loads(checks),
  "alerting": "external_alert_destination_deferred",
  "authoritative_write": False,
}
print(json.dumps(obj, indent=2))
PY
      echo "Woodright monitor $TS overall=$OVERALL exit=$EXIT_CODE (advisory; unprovisioned)" >&2
      exit "$EXIT_CODE"
    fi
    mkdir -p "$STATE_DIR" "$HISTORY_DIR" 2>/dev/null || true
    python3 - "$OUT_JSON" "$HIST" "$TS" "$OVERALL" "$EXIT_CODE" "$CHECKS_JSON" "$SF_IMG" "$BE_IMG" <<'PY'
import json, sys, os
out, hist, ts, overall, code, checks, sf, be = sys.argv[1:]
obj = {
  "timestamp_utc": ts,
  "overall": overall,
  "exit_code": int(code),
  "storefront_image": sf,
  "backend_image": be,
  "environment": "public_production",
  "checks": json.loads(checks),
  "alerting": "external_alert_destination_deferred",
}
for p in (out, hist):
  os.makedirs(os.path.dirname(p), exist_ok=True)
  with open(p, "w", encoding="utf-8") as f:
    json.dump(obj, f, indent=2)
    f.write("\n")
  mode = 0o644 if p.endswith("last-status.json") else 0o600
  os.chmod(p, mode)
print(json.dumps(obj, indent=2))
PY
    echo "Woodright monitor $TS overall=$OVERALL exit=$EXIT_CODE (unprovisioned fail-closed)" >&2
    exit "$EXIT_CODE"
  fi
fi

if [[ "${WOODRIGHT_FIXTURE_BE_DISCOVERY_OK:-0}" == "1" && -n "${WOODRIGHT_BE_CONTAINER:-}" ]]; then
  BE_CONTAINER="$WOODRIGHT_BE_CONTAINER"
  BE_DISCOVERY_OK=1
  add_check "discovery_be" info pass "verdict=FIXTURE container=$BE_CONTAINER"
elif wr_discover_backend_container >/dev/null 2>&1; then
  BE_CONTAINER="$WR_BE_CONTAINER"
  BE_DISCOVERY_OK=1
  add_check "discovery_be" info pass "verdict=${WR_DISCOVERY_VERDICT:-DISCOVERY_OK} container=$BE_CONTAINER"
else
  add_check "discovery_be" critical fail "verdict=${WR_DISCOVERY_VERDICT:-DISCOVERY_FAIL}"
fi
if [[ "${WOODRIGHT_FIXTURE_SF_DISCOVERY_OK:-0}" == "1" && -n "${WOODRIGHT_SF_CONTAINER:-}" ]]; then
  SF_CONTAINER="$WOODRIGHT_SF_CONTAINER"
  SF_DISCOVERY_OK=1
  add_check "discovery_sf" info pass "verdict=FIXTURE container=$SF_CONTAINER"
elif wr_discover_storefront_container >/dev/null 2>&1; then
  SF_CONTAINER="$WR_SF_CONTAINER"
  SF_DISCOVERY_OK=1
  add_check "discovery_sf" info pass "verdict=${WR_DISCOVERY_VERDICT:-DISCOVERY_OK} container=$SF_CONTAINER"
else
  add_check "discovery_sf" critical fail "verdict=${WR_DISCOVERY_VERDICT:-DISCOVERY_FAIL}"
fi

# --- BUYER ---
for path in / /catalog /kids/catalog; do
  code=$(curl_code "${BUYER_HOST}${path}")
  if [[ "$code" == "200" ]]; then
    add_check "buyer${path}" info pass "http=$code"
  else
    add_check "buyer${path}" critical fail "http=$code"
  fi
done
# /product-static index may 301/404; probe a known asset instead (media integrity).
PS_ASSET="${WOODRIGHT_PRODUCT_STATIC_PROBE:-/product-static/products/oliver/OL-95-1_gallery_02.jpg}"
PS_CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -L "${BUYER_HOST}${PS_ASSET}" 2>/dev/null || echo "000")
if [[ "$PS_CODE" == "200" ]]; then
  add_check "buyer_product_static_asset" info pass "http=$PS_CODE path=$PS_ASSET"
else
  add_check "buyer_product_static_asset" critical fail "http=$PS_CODE path=$PS_ASSET"
fi
# PDP - try a known handle or skip soft
PDP_CODE=$(curl_code "${BUYER_HOST}/products" || true)
# soft: catalog already covered

# SEO / security headers on buyer /
XR=$(curl_hdr "$BUYER_HOST/" "x-robots-tag" || true)
[[ "$XR" == *noindex* ]] && add_check "buyer_x_robots" info pass "present" || add_check "buyer_x_robots" warning fail "missing_or_indexable"
CSP=$(curl_hdr "$BUYER_HOST/" "content-security-policy" || true)
[[ -n "$CSP" ]] && add_check "buyer_csp" info pass "present" || add_check "buyer_csp" warning fail "missing"
HSTS=$(curl_hdr "$BUYER_HOST/" "strict-transport-security" || true)
[[ -n "$HSTS" ]] && add_check "buyer_hsts" info pass "present" || add_check "buyer_hsts" warning fail "missing"
NOSNIFF=$(curl_hdr "$BUYER_HOST/" "x-content-type-options" || true)
[[ "$NOSNIFF" == *nosniff* ]] && add_check "buyer_nosniff" info pass "present" || add_check "buyer_nosniff" warning fail "missing"

ROBOTS=$(curl_code "${BUYER_HOST}/robots.txt")
[[ "$ROBOTS" == "200" ]] && add_check "robots_txt" info pass "http=200" || add_check "robots_txt" warning fail "http=$ROBOTS"
SITEMAP=$(curl_code "${BUYER_HOST}/sitemap.xml")
[[ "$SITEMAP" == "404" ]] && add_check "sitemap_disabled" info pass "http=404" || add_check "sitemap_disabled" warning fail "http=$SITEMAP"

# API
API_CODE=$(curl_code "${API_HOST}/")
[[ "$API_CODE" != "000" ]] && add_check "api_host" info pass "http=$API_CODE" || add_check "api_host" critical fail "unreachable"
API_XR=$(curl_hdr "$API_HOST/" "x-robots-tag" || true)
[[ "$API_XR" == *noindex* ]] && add_check "api_x_robots" info pass "present" || add_check "api_x_robots" warning fail "missing"
STORE_REG=$(curl_code "${API_HOST}/store/regions")
# without publishable key expect 400/401
if [[ "$STORE_REG" == "400" || "$STORE_REG" == "401" || "$STORE_REG" == "403" ]]; then
  add_check "store_regions_denied" info pass "http=$STORE_REG"
else
  add_check "store_regions_denied" warning fail "http=$STORE_REG"
fi

# Containers (only discovered SF/BE + fixed data plane names)
check_container() {
  local c="$1" label="$2"
  [[ -n "$c" ]] || { add_check "container_${label}" critical fail "undiscovered"; return; }
  st=$(docker inspect "$c" --format '{{.State.Health.Status}}{{.State.Status}}' 2>/dev/null || true)
  if [[ -n "$st" ]]; then
    restarts=$(docker inspect "$c" --format '{{.RestartCount}}' 2>/dev/null || echo "?")
    if [[ "$st" == *running* || "$st" == *healthy* ]]; then
      add_check "container_${label}" info pass "state=$st restarts=$restarts name=$c"
    else
      add_check "container_${label}" critical fail "state=$st name=$c"
    fi
  else
    add_check "container_${label}" critical fail "missing name=$c"
  fi
}
check_container "$SF_CONTAINER" "storefront"
check_container "$BE_CONTAINER" "backend"
check_container "$PG_CONTAINER" "postgres"
check_container "$REDIS_CONTAINER" "redis"

# Media mount (backend only when discovery succeeded).
# Expected identity comes from the governed environment profile
# (WOODRIGHT_MEDIA_VOLUME + WOODRIGHT_MEDIA_MOUNT_IN_BE). Never hardcode a
# staging volume name here - that caused false-critical on production-candidate.
MEDIA_OK=0
check_media_mount_contract() {
  local container="$1"
  local expected_vol expected_dest
  local fixture_json="${WOODRIGHT_FIXTURE_MEDIA_MOUNTS_JSON:-}"
  expected_vol="${WOODRIGHT_MEDIA_VOLUME:-}"
  expected_dest="${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}"

  if [[ -n "$FIXTURE_MEDIA_PATH" ]]; then
    add_check "media_mount" critical fail "fixture_missing"
    return
  fi
  if [[ -z "$expected_vol" ]]; then
    add_check "media_mount" critical fail "missing_expected_media_identity"
    return
  fi
  if [[ -z "$expected_dest" ]]; then
    add_check "media_mount" critical fail "missing_expected_media_destination"
    return
  fi

  # Structural inspect: exactly one Type=volume match on Name+Destination.
  # Fixture JSON (tests only) bypasses docker when WOODRIGHT_FIXTURE_MEDIA_MOUNTS_JSON is set.
  local verdict
  verdict="$(
    EXPECTED_VOL="$expected_vol" EXPECTED_DEST="$expected_dest" \
    CONTAINER="$container" FIXTURE_JSON="$fixture_json" python3 <<'PY'
import json, os, subprocess, sys

want_name = os.environ["EXPECTED_VOL"]
want_dest = os.environ["EXPECTED_DEST"]
fixture = os.environ.get("FIXTURE_JSON") or ""
container = os.environ.get("CONTAINER") or ""

def fail(code: str) -> None:
    print(code)
    sys.exit(0)

try:
    if fixture:
        mounts = json.loads(fixture)
        if not isinstance(mounts, list):
            fail("malformed_inspect")
    else:
        raw = subprocess.check_output(
            ["docker", "inspect", container],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        docs = json.loads(raw)
        if not isinstance(docs, list) or not docs:
            fail("malformed_inspect")
        mounts = docs[0].get("Mounts")
        if mounts is None:
            fail("malformed_inspect")
        if not isinstance(mounts, list):
            fail("malformed_inspect")
except (subprocess.CalledProcessError, json.JSONDecodeError, OSError, TypeError, KeyError):
    fail("inspect_failed")

matches = []
for m in mounts:
    if not isinstance(m, dict):
        fail("malformed_inspect")
    if (
        m.get("Type") == "volume"
        and m.get("Name") == want_name
        and m.get("Destination") == want_dest
    ):
        matches.append(m)

if len(matches) == 0:
    # Distinguish wrong volume / wrong dest / bind / absent for operators.
    same_dest = [m for m in mounts if isinstance(m, dict) and m.get("Destination") == want_dest]
    if not same_dest:
        fail("absent")
    if any(m.get("Type") == "bind" for m in same_dest):
        fail("bind_mount")
    names = sorted({str(m.get("Name") or "") for m in same_dest})
    if names and names != [want_name]:
        fail("wrong_volume")
    fail("absent")
if len(matches) > 1:
    fail("ambiguous_multiple_mounts")
print("pass")
PY
  )"

  case "$verdict" in
    pass)
      MEDIA_OK=1
      add_check "media_mount" info pass "present vol=${expected_vol}"
      ;;
    missing_expected_media_identity|missing_expected_media_destination)
      add_check "media_mount" critical fail "$verdict"
      ;;
    *)
      add_check "media_mount" critical fail "${verdict:-unknown}"
      ;;
  esac
}

if [[ "$BE_DISCOVERY_OK" -eq 1 ]]; then
  check_media_mount_contract "$BE_CONTAINER"
else
  add_check "media_mount" critical fail "skipped_undiscovered_backend"
fi

# Identity digests
SF_IMG="unknown"
BE_IMG="unknown"
[[ "$SF_DISCOVERY_OK" -eq 1 ]] && SF_IMG=$(docker inspect "$SF_CONTAINER" --format '{{.Image}}' 2>/dev/null || echo unknown)
[[ "$BE_DISCOVERY_OK" -eq 1 ]] && BE_IMG=$(docker inspect "$BE_CONTAINER" --format '{{.Image}}' 2>/dev/null || echo unknown)
EXP_SF=""; EXP_BE=""; OWNER="unknown"
if [[ -f "$EXPECTED_RELEASE" ]]; then
  EXP_SF=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("storefront_digest") or d.get("sf_digest") or "")' "$EXPECTED_RELEASE" 2>/dev/null || true)
  EXP_BE=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("backend_digest") or d.get("be_digest") or "")' "$EXPECTED_RELEASE" 2>/dev/null || true)
fi
if [[ -z "$EXP_SF" && -f "$ACTIVE_OWNER" ]]; then
  EXP_SF=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("storefront_digest") or d.get("sf_digest") or "")' "$ACTIVE_OWNER" 2>/dev/null || true)
  EXP_BE=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("backend_digest") or d.get("be_digest") or "")' "$ACTIVE_OWNER" 2>/dev/null || true)
  OWNER=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("owner") or d.get("runtime_owner") or "dokploy")' "$ACTIVE_OWNER" 2>/dev/null || echo dokploy)
fi
if [[ -n "$FIXTURE_DIGEST" ]]; then
  EXP_SF="$FIXTURE_DIGEST"
fi
# Compare trailing 12 of sha256 if full id
sf_match=0
if [[ -n "$EXP_SF" && "$SF_IMG" == *"${EXP_SF#sha256:}"* ]] || [[ -n "$EXP_SF" && "$SF_IMG" == *"$EXP_SF"* ]]; then
  sf_match=1
elif [[ -z "$EXP_SF" ]]; then
  add_check "digest_sf" warning fail "no_expected_manifest"
else
  # also accept short prefix match
  short=$(echo "${EXP_SF#sha256:}" | cut -c1-12)
  [[ "$SF_IMG" == *"$short"* ]] && sf_match=1
fi
[[ $sf_match -eq 1 ]] && add_check "digest_sf" info pass "match" || add_check "digest_sf" warning fail "mismatch"

be_match=0
if [[ -n "$EXP_BE" ]]; then
  short=$(echo "${EXP_BE#sha256:}" | cut -c1-12)
  [[ "$BE_IMG" == *"$short"* || "$BE_IMG" == *"${EXP_BE#sha256:}"* ]] && be_match=1
fi
[[ -z "$EXP_BE" ]] && add_check "digest_be" warning fail "no_expected" || \
  { [[ $be_match -eq 1 ]] && add_check "digest_be" info pass "match" || add_check "digest_be" warning fail "mismatch"; }

# Nightly / forbidden revision markers (process/lock, not keeper image names alone)
if [[ -f /srv/woodright/runtime-ownership/NIGHTLY.lock ]] || pgrep -af 'nightly.*woodright|woodright.*nightly' 2>/dev/null | grep -vqE 'grep|pgrep'; then
  add_check "nightly_absent" critical fail "present"
else
  add_check "nightly_absent" info pass "absent"
fi
# 18fd465 as *running* controller - check running containers image labels only
if docker ps --format '{{.Image}} {{.Names}}' 2>/dev/null | grep -q '18fd465'; then
  add_check "forbidden_rev_18fd465" critical fail "running"
else
  add_check "forbidden_rev_18fd465" info pass "not_running"
fi
[[ "$OWNER" == *dokploy* || "$OWNER" == dokploy || -f "$ACTIVE_OWNER" ]] && add_check "dokploy_owner" info pass "ok" || add_check "dokploy_owner" warning fail "unknown"

# Network: raw ports should not accept from outside - we check local listen + note DOCKER-USER
for port in 3000 3002 9000; do
  if ss -lntH "( sport = :$port )" 2>/dev/null | grep -q .; then
    add_check "listen_$port" info pass "listen_present_expect_DOCKER_USER_drop"
  else
    add_check "listen_$port" info pass "not_listening"
  fi
done

# Host-publish contract (profile policy). Distinguishes deny vs loopback allowlist.
# Candidate loopback ports (3200/9200) are NOT treated as raw public ports.
# Fail-closed: if SF+BE discovered but no policy/profile, treat as deny (any HostPort → critical).
if [[ -n "${WOODRIGHT_HOST_PUBLISH_POLICY:-}" || -n "$FIXTURE_HOST_PUBLISH_JSON" ]]; then
  if [[ -n "$FIXTURE_HOST_PUBLISH_JSON" ]]; then
    HP_DETAIL="$FIXTURE_HOST_PUBLISH_JSON"
    HP_OK=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print("1" if d.get("ok") else "0")' "$HP_DETAIL")
    HP_TOKEN=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(d.get("monitor_token") or d.get("verdict") or "host_publish")' "$HP_DETAIL")
  elif [[ "${SF_DISCOVERY_OK}" -eq 1 && "${BE_DISCOVERY_OK}" -eq 1 ]]; then
    set +e
    HP_DETAIL="$(
      export WR_HP_MODE=live
      export WR_HP_POLICY="${WOODRIGHT_HOST_PUBLISH_POLICY}"
      export WR_HP_ALLOWED="${WOODRIGHT_ALLOWED_HOST_BINDINGS:-}"
      export WR_HP_ROLE=all
      be_b="$(wr_hp_docker_bindings_json "$BE_CONTAINER" backend)"
      sf_b="$(wr_hp_docker_bindings_json "$SF_CONTAINER" storefront)"
      export WR_HP_BINDINGS_JSON="$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1])+json.loads(sys.argv[2])))' "$be_b" "$sf_b")"
      export WR_HP_NETWORK_MODE="$(docker inspect "$BE_CONTAINER" --format '{{.HostConfig.NetworkMode}}' 2>/dev/null || true)"
      export WR_HP_COMPOSE_PROJECT="$(docker inspect "$BE_CONTAINER" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
      export WR_HP_EXPECTED_COMPOSE="${WOODRIGHT_COMPOSE_PROJECT:-}"
      export WR_HP_REQUIRE_COMPOSE="${WOODRIGHT_REQUIRE_COMPOSE_LABEL:-0}"
      wr_hp_evaluate_python 2>/dev/null
    )"
    HP_RC=$?
    set -e
    if [[ $HP_RC -eq 0 ]]; then
      HP_OK=1
      HP_TOKEN=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(d.get("monitor_token") or "host_publish_pass")' "$HP_DETAIL")
    else
      HP_OK=0
      HP_TOKEN=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); v=d.get("verdict") or "";
print(d.get("monitor_token") or ("host_publish_public_bind_critical" if "PUBLIC" in v else "host_publish_unexpected_port_critical" if "UNEXPECTED" in v else "host_publish_profile_mismatch_critical"))' "${HP_DETAIL:-}")
    fi
  else
    HP_OK=0
    HP_TOKEN="host_publish_policy_missing_critical"
    HP_DETAIL='{"ok":false,"verdict":"HOST_PUBLISH_POLICY_OR_DISCOVERY"}'
  fi
  if [[ "$HP_OK" == "1" ]]; then
    add_check "$HP_TOKEN" info pass "$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print("policy=%s expected=%s actual=%s" % (d.get("policy"), d.get("expected_bindings"), d.get("actual_bindings")))' "$HP_DETAIL")"
  else
    add_check "$HP_TOKEN" critical fail "$(python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); print(d.get("message") or d.get("verdict") or "host_publish_fail")' "${HP_DETAIL:-}")"
  fi
elif [[ "${SF_DISCOVERY_OK}" -eq 1 && "${BE_DISCOVERY_OK}" -eq 1 ]]; then
  # No profile policy loaded: fail-closed deny for discovered app pair (prevents monitor false-green).
  set +e
  be_b="$(wr_hp_docker_bindings_json "$BE_CONTAINER" backend)"
  sf_b="$(wr_hp_docker_bindings_json "$SF_CONTAINER" storefront)"
  merged="$(python3 -c 'import json,sys; print(json.dumps(json.loads(sys.argv[1])+json.loads(sys.argv[2])))' "$be_b" "$sf_b")"
  HP_DETAIL="$(wr_hp_fail_closed_deny_bindings_json "$merged" 2>/dev/null)"
  HP_RC=$?
  set -e
  if [[ $HP_RC -eq 0 ]]; then
    add_check "host_publish_denied_pass" warning pass "fail_closed_deny_no_profile actual=[]"
  else
    add_check "host_publish_policy_missing_critical" critical fail "$(python3 -c 'import json,sys; d=json.loads(sys.argv[1] or "{}"); print(d.get("message") or "host_publish without profile; published ports present")' "${HP_DETAIL:-}")"
  fi
elif [[ "${WOODRIGHT_ENV_PROFILE_LOADED:-0}" == "1" ]]; then
  add_check "host_publish_policy_missing_critical" critical fail "WOODRIGHT_HOST_PUBLISH_POLICY unset"
fi

# Public postgres/redis
if ss -lntH '( sport = :5432 )' 2>/dev/null | grep -q '0.0.0.0\|::\|\*'; then
  # may be docker-proxy bound - still check DOCKER-USER intent via iptables read
  add_check "pg_bind" warning fail "host_listen_5432"
else
  add_check "pg_bind" info pass "not_public"
fi

# TLS expiry
TLS_HOST="${FIXTURE_TLS_HOST:-woodright-demo.ru}"
TLS_DAYS=$(echo | openssl s_client -servername "$TLS_HOST" -connect "${TLS_HOST}:443" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null \
  | sed 's/notAfter=//' \
  | xargs -I{} date -u -d {} +%s 2>/dev/null || echo "")
NOW=$(date -u +%s)
if [[ -n "$TLS_DAYS" ]]; then
  LEFT=$(( (TLS_DAYS - NOW) / 86400 ))
  if [[ $LEFT -lt 14 ]]; then
    add_check "tls_expiry" critical fail "days_left=$LEFT"
  elif [[ $LEFT -lt 30 ]]; then
    add_check "tls_expiry" warning fail "days_left=$LEFT"
  else
    add_check "tls_expiry" info pass "days_left=$LEFT"
  fi
else
  add_check "tls_expiry" warning fail "unparsed"
fi

# Resources
DISK_PCT=${FIXTURE_DISK_PCT:-$(df -P / | awk 'NR==2{gsub(/%/,"",$5);print $5}')}
INODE_PCT=$(df -Pi / | awk 'NR==2{gsub(/%/,"",$5);print $5}')
if [[ "$DISK_PCT" -ge "$DISK_CRIT" ]]; then add_check "disk" critical fail "pct=$DISK_PCT"
elif [[ "$DISK_PCT" -ge "$DISK_WARN" ]]; then add_check "disk" warning fail "pct=$DISK_PCT"
else add_check "disk" info pass "pct=$DISK_PCT"; fi
if [[ "$INODE_PCT" -ge "$INODE_CRIT" ]]; then add_check "inodes" critical fail "pct=$INODE_PCT"
elif [[ "$INODE_PCT" -ge "$INODE_WARN" ]]; then add_check "inodes" warning fail "pct=$INODE_PCT"
else add_check "inodes" info pass "pct=$INODE_PCT"; fi

# Backup freshness
MANIFESTS_DIR="$BACKUP_ROOT/manifests"
if [[ -n "$FIXTURE_BACKUP_AGE_H" ]]; then
  AGE_H="$FIXTURE_BACKUP_AGE_H"
  if [[ "$AGE_H" -gt "$BACKUP_CRIT_H" ]]; then add_check "backup_freshness" critical fail "age_h=$AGE_H"
  elif [[ "$AGE_H" -gt "$BACKUP_WARN_H" ]]; then add_check "backup_freshness" warning fail "age_h=$AGE_H"
  else add_check "backup_freshness" info pass "age_h=$AGE_H"; fi
elif [[ ! -d "$BACKUP_ROOT" ]]; then
  add_check "backup_freshness" critical fail "manifests_inaccessible"
elif [[ ! -r "$BACKUP_ROOT" || ! -x "$BACKUP_ROOT" ]]; then
  add_check "backup_freshness" critical fail "manifests_inaccessible"
elif [[ ! -d "$MANIFESTS_DIR" ]]; then
  add_check "backup_freshness" critical fail "manifests_dir_missing"
elif [[ ! -r "$MANIFESTS_DIR" || ! -x "$MANIFESTS_DIR" ]]; then
  add_check "backup_freshness" critical fail "manifests_inaccessible"
else
  LATEST_RP=$(ls -1t "$MANIFESTS_DIR"/recovery-point-*.json 2>/dev/null | head -1 || true)
  if [[ -n "$LATEST_RP" ]]; then
    BT=$(basename "$LATEST_RP" | sed -n 's/recovery-point-\([0-9T]*Z\)\.json/\1/p')
    BS=$(date -u -d "${BT:0:4}-${BT:4:2}-${BT:6:2} ${BT:9:2}:${BT:11:2}:${BT:13:2}" +%s 2>/dev/null || echo 0)
    AGE_H=$(( (NOW - BS) / 3600 ))
    if [[ "$AGE_H" -gt "$BACKUP_CRIT_H" ]]; then add_check "backup_freshness" critical fail "age_h=$AGE_H"
    elif [[ "$AGE_H" -gt "$BACKUP_WARN_H" ]]; then add_check "backup_freshness" warning fail "age_h=$AGE_H"
    else add_check "backup_freshness" info pass "age_h=$AGE_H path=$(basename "$LATEST_RP")"; fi
  else
    add_check "backup_freshness" critical fail "manifests_absent"
  fi
fi

# DB / Redis readiness (no query text / no keys / no connection strings)
# Identity must come from profile (WOODRIGHT_DB_USER + WOODRIGHT_DB_NAME) or explicit
# WOODRIGHT_MONITOR_PG_USER / WOODRIGHT_MONITOR_PG_DB. Never hardcode role "woodright"
# for every stack — production uses woodright_production; public_demo uses woodright.
if [[ -z "${MONITOR_PG_USER}" ]]; then
  add_check "postgres_ready" critical fail "missing_db_user env=${WOODRIGHT_ENVIRONMENT:-none} db=${MONITOR_PG_DB} pg=${PG_CONTAINER}"
elif ! docker exec "$PG_CONTAINER" pg_isready -U "$MONITOR_PG_USER" >/dev/null 2>&1; then
  add_check "postgres_ready" critical fail "not_ready user=${MONITOR_PG_USER} db=${MONITOR_PG_DB} pg=${PG_CONTAINER}"
else
  # Prove role+database identity with a trivial read-only query before stats.
  if ! docker exec "$PG_CONTAINER" psql -U "$MONITOR_PG_USER" -d "$MONITOR_PG_DB" -tAc "SELECT 1" >/dev/null 2>&1; then
    add_check "postgres_ready" critical fail "identity_mismatch user=${MONITOR_PG_USER} db=${MONITOR_PG_DB} pg=${PG_CONTAINER} env=${WOODRIGHT_ENVIRONMENT:-none}"
  else
    CONN=$(docker exec "$PG_CONTAINER" psql -U "$MONITOR_PG_USER" -d "$MONITOR_PG_DB" -tAc "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -d ' ' || echo "?")
    LONG=$(docker exec "$PG_CONTAINER" psql -U "$MONITOR_PG_USER" -d "$MONITOR_PG_DB" -tAc "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND now()-query_start > interval '5 minutes';" 2>/dev/null | tr -d ' ' || echo "?")
    BLOCKED=$(docker exec "$PG_CONTAINER" psql -U "$MONITOR_PG_USER" -d "$MONITOR_PG_DB" -tAc "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock';" 2>/dev/null | tr -d ' ' || echo "?")
    add_check "postgres_ready" info pass "conn=$CONN long=$LONG blocked=$BLOCKED user=${MONITOR_PG_USER} db=${MONITOR_PG_DB} env=${WOODRIGHT_ENVIRONMENT:-none}"
  fi
fi
if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then
  MEM=$(docker exec "$REDIS_CONTAINER" redis-cli INFO memory 2>/dev/null | awk -F: '/used_memory_human/{gsub(/\r/,"",$2);print $2}')
  add_check "redis_ping" info pass "mem=$MEM redis=${REDIS_CONTAINER}"
else
  add_check "redis_ping" critical fail "no_pong redis=${REDIS_CONTAINER}"
fi

# Write outputs (authoritative path only)
OUT_JSON="$STATE_DIR/last-status.json"
OUT_TXT="$STATE_DIR/last-status.txt"
HIST="$HISTORY_DIR/status-${TS}.json"

if [[ "$WR_MONITOR_WRITE" != "1" ]]; then
  python3 - "$TS" "$OVERALL" "$EXIT_CODE" "$CHECKS_JSON" "$SF_IMG" "$BE_IMG" <<'PY'
import json, sys
ts, overall, code, checks, sf, be = sys.argv[1:]
obj = {
  "timestamp_utc": ts,
  "overall": overall,
  "exit_code": int(code),
  "storefront_image": sf,
  "backend_image": be,
  "checks": json.loads(checks),
  "alerting": "external_alert_destination_deferred",
  "authoritative_write": False,
  "note": "non-root advisory run; did not overwrite monitor state",
}
print(json.dumps(obj, indent=2))
PY
  echo "Woodright monitor $TS overall=$OVERALL exit=$EXIT_CODE (advisory; state not written)" >&2
  exit "$EXIT_CODE"
fi

python3 - "$OUT_JSON" "$HIST" "$TS" "$OVERALL" "$EXIT_CODE" "$CHECKS_JSON" "$SF_IMG" "$BE_IMG" <<'PY'
import json, sys, os
out, hist, ts, overall, code, checks, sf, be = sys.argv[1:]
obj = {
  "timestamp_utc": ts,
  "overall": overall,
  "exit_code": int(code),
  "storefront_image": sf,
  "backend_image": be,
  "checks": json.loads(checks),
  "alerting": "external_alert_destination_deferred",
}
for p in (out, hist):
  os.makedirs(os.path.dirname(p), exist_ok=True)
  with open(p, "w", encoding="utf-8") as f:
    json.dump(obj, f, indent=2)
    f.write("\n")
  # last-status.json must be readable by non-root cutover operators;
  # history copies stay private.
  mode = 0o644 if p.endswith("last-status.json") else 0o600
  os.chmod(p, mode)
print(json.dumps(obj, indent=2))
PY

{
  echo "Woodright monitor $TS overall=$OVERALL exit=$EXIT_CODE"
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1]));
[print(f"  [{c[\"severity\"]}] {c[\"name\"]}: {c[\"status\"]} — {c[\"detail\"]}".replace("—","-")) for c in d["checks"]]' "$OUT_JSON" 2>/dev/null \
  || python3 -c 'import json,sys; d=json.load(open(sys.argv[1]));
[print("  [%s] %s: %s - %s" % (c["severity"], c["name"], c["status"], c["detail"])) for c in d["checks"]]' "$OUT_JSON"
} >"$OUT_TXT"
chmod 0644 "$OUT_TXT"

# Keep history bounded (last 200)
old=()
while IFS= read -r f; do
  [[ -n "$f" ]] && old+=("$f")
done < <(ls -1t "$HISTORY_DIR"/status-*.json 2>/dev/null | tail -n +201 || true)
for f in "${old[@]:-}"; do [[ -n "${f:-}" ]] && rm -f -- "$f"; done

# Touch last-success / last-failure markers
if [[ $EXIT_CODE -eq 0 ]]; then
  cp -a "$OUT_JSON" "$STATE_DIR/last-success.json"
else
  cp -a "$OUT_JSON" "$STATE_DIR/last-failure.json"
fi

exit "$EXIT_CODE"
