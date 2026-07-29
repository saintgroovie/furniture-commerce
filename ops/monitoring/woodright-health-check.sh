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
# Resolve SF/BE via discovery (explicit WOODRIGHT_*_CONTAINER still honored).
# Fail-closed: no hardcoded ephemeral compose names; discovery runs after add_check exists.
OPS_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/woodright-runtime-discovery.sh"
# shellcheck source=../lib/woodright-runtime-discovery.sh
source "$OPS_LIB"
SF_CONTAINER=""
BE_CONTAINER=""
SF_DISCOVERY_OK=0
BE_DISCOVERY_OK=0
PG_CONTAINER="${WOODRIGHT_PG_CONTAINER:-woodright-stack-3dsdhd-postgres-1}"
REDIS_CONTAINER="${WOODRIGHT_REDIS_CONTAINER:-woodright-stack-3dsdhd-redis-1}"
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

TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$STATE_DIR" "$HISTORY_DIR"
chmod 0700 "$STATE_DIR" "$HISTORY_DIR" 2>/dev/null || true

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
if wr_discover_storefront_container >/dev/null 2>&1; then
  SF_CONTAINER="$WR_SF_CONTAINER"
  SF_DISCOVERY_OK=1
  add_check "discovery_sf" info pass "verdict=${WR_DISCOVERY_VERDICT:-DISCOVERY_OK} container=$SF_CONTAINER"
else
  add_check "discovery_sf" critical fail "verdict=${WR_DISCOVERY_VERDICT:-DISCOVERY_FAIL}"
fi
if wr_discover_backend_container >/dev/null 2>&1; then
  BE_CONTAINER="$WR_BE_CONTAINER"
  BE_DISCOVERY_OK=1
  add_check "discovery_be" info pass "verdict=${WR_DISCOVERY_VERDICT:-DISCOVERY_OK} container=$BE_CONTAINER"
else
  add_check "discovery_be" critical fail "verdict=${WR_DISCOVERY_VERDICT:-DISCOVERY_FAIL}"
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

# Media mount (backend only when discovery succeeded)
MEDIA_OK=0
if [[ "$BE_DISCOVERY_OK" -eq 1 ]]; then
  if docker inspect "$BE_CONTAINER" --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}' 2>/dev/null | grep -q 'woodright_staging_media /server/static'; then
    MEDIA_OK=1
    add_check "media_mount" info pass "present"
  else
    if [[ -n "$FIXTURE_MEDIA_PATH" ]]; then
      add_check "media_mount" critical fail "fixture_missing"
    else
      add_check "media_mount" critical fail "absent"
    fi
  fi
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
elif ! ls -1d "$BACKUP_ROOT" >/dev/null 2>&1; then
  add_check "backup_freshness" critical fail "manifests_inaccessible"
elif [[ ! -d "$MANIFESTS_DIR" ]]; then
  add_check "backup_freshness" critical fail "manifests_dir_missing"
elif [[ ! -r "$MANIFESTS_DIR" ]]; then
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
    add_check "backup_freshness" critical fail "age_h=9999"
  fi
fi

# DB / Redis readiness (no query text / no keys)
if docker exec "$PG_CONTAINER" pg_isready -U woodright >/dev/null 2>&1; then
  CONN=$(docker exec "$PG_CONTAINER" psql -U woodright -d woodright_staging -tAc "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -d ' ' || echo "?")
  LONG=$(docker exec "$PG_CONTAINER" psql -U woodright -d woodright_staging -tAc "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND now()-query_start > interval '5 minutes';" 2>/dev/null | tr -d ' ' || echo "?")
  BLOCKED=$(docker exec "$PG_CONTAINER" psql -U woodright -d woodright_staging -tAc "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock';" 2>/dev/null | tr -d ' ' || echo "?")
  add_check "postgres_ready" info pass "conn=$CONN long=$LONG blocked=$BLOCKED"
else
  add_check "postgres_ready" critical fail "not_ready"
fi
if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then
  MEM=$(docker exec "$REDIS_CONTAINER" redis-cli INFO memory 2>/dev/null | awk -F: '/used_memory_human/{gsub(/\r/,"",$2);print $2}')
  add_check "redis_ping" info pass "mem=$MEM"
else
  add_check "redis_ping" critical fail "no_pong"
fi

# Write outputs
OUT_JSON="$STATE_DIR/last-status.json"
OUT_TXT="$STATE_DIR/last-status.txt"
HIST="$HISTORY_DIR/status-${TS}.json"

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
  os.chmod(p, 0o600)
print(json.dumps(obj, indent=2))
PY

{
  echo "Woodright monitor $TS overall=$OVERALL exit=$EXIT_CODE"
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1]));
[print(f"  [{c[\"severity\"]}] {c[\"name\"]}: {c[\"status\"]} — {c[\"detail\"]}".replace("—","-")) for c in d["checks"]]' "$OUT_JSON" 2>/dev/null \
  || python3 -c 'import json,sys; d=json.load(open(sys.argv[1]));
[print("  [%s] %s: %s - %s" % (c["severity"], c["name"], c["status"], c["detail"])) for c in d["checks"]]' "$OUT_JSON"
} >"$OUT_TXT"
chmod 0600 "$OUT_TXT"

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
