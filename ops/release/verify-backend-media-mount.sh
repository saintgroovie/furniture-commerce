#!/usr/bin/env bash
# Fail-closed pre-promote gate: refuse backend promotion without durable media mount.
# Read-only. Never repairs mounts, never updates ACTIVE_OWNER / EXPECTED_RELEASE.
#
# Usage:
#   ops/release/verify-backend-media-mount.sh [--container NAME]
#   ops/release/verify-backend-media-mount.sh --compose-only [--compose-file PATH]
#   ops/release/verify-backend-media-mount.sh --fixture-dir DIR
#
# Exit 0 only when all required checks PASS. Prints JSON summary on stdout.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../lib/woodright-runtime-discovery.sh
source "$ROOT/ops/lib/woodright-runtime-discovery.sh"

COMPOSE_FILE="${WOODRIGHT_COMPOSE_FILE:-$ROOT/docker-compose.staging.yml}"
MEDIA_VOLUME="${WOODRIGHT_MEDIA_VOLUME:-woodright-stack-3dsdhd_woodright_staging_media}"
MEDIA_DEST="${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}"
MIN_FILES="${WOODRIGHT_MEDIA_MIN_FILES:-100}"
MIN_BYTES="${WOODRIGHT_MEDIA_MIN_BYTES:-1048576}"
BUYER_HOST="${WOODRIGHT_BUYER_HOST:-}"
PRODUCT_STATIC_SAMPLE="${WOODRIGHT_PRODUCT_STATIC_SAMPLE:-/product-static/products/oliver/OL-95-1_gallery_02.jpg}"
REQUIRE_RW=1
COMPOSE_ONLY=0
FIXTURE_DIR=""
CONTAINER_ARG=""

fail_json() {
  local code="$1" msg="$2"
  python3 -c 'import json,sys; print(json.dumps({"ok":False,"verdict":sys.argv[1],"message":sys.argv[2]},indent=2))' "$code" "$msg"
  exit 1
}

ok_json() {
  python3 -c 'import json,sys; print(json.dumps({"ok":True,"verdict":"MEDIA_GATE_PASS","detail":json.loads(sys.argv[1])},indent=2))' "$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container) CONTAINER_ARG="$2"; shift 2 ;;
    --compose-file) COMPOSE_FILE="$2"; shift 2 ;;
    --compose-only) COMPOSE_ONLY=1; shift ;;
    --fixture-dir) FIXTURE_DIR="$2"; shift 2 ;;
    --buyer-host) BUYER_HOST="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) fail_json INVALID_ARG "unknown arg $1" ;;
  esac
done

assert_compose_declares_media() {
  local text
  [[ -f "$COMPOSE_FILE" ]] || fail_json COMPOSE_MISSING "compose not found: $COMPOSE_FILE"
  text=$(cat "$COMPOSE_FILE")
  # backend service must map volume to /server/static
  echo "$text" | grep -q 'woodright_staging_media:/server/static' \
    || fail_json COMPOSE_MOUNT_MISSING "compose missing woodright_staging_media:/server/static"
  echo "$text" | grep -q 'name: woodright-stack-3dsdhd_woodright_staging_media' \
    || fail_json COMPOSE_VOLUME_NAME "compose missing external volume full name"
  echo "$text" | grep -A2 'woodright_staging_media:' | grep -q 'external: true' \
    || fail_json COMPOSE_EXTERNAL "media volume must be external: true"
}

if [[ "$COMPOSE_ONLY" -eq 1 ]]; then
  assert_compose_declares_media
  ok_json '{"compose":"ok"}'
  exit 0
fi

# Fixture mode: JSON describing mounts / counts (no Docker mutate)
if [[ -n "$FIXTURE_DIR" ]]; then
  [[ -d "$FIXTURE_DIR" ]] || fail_json FIXTURE_MISSING "$FIXTURE_DIR"
  python3 - "$FIXTURE_DIR" "$MEDIA_VOLUME" "$MEDIA_DEST" "$MIN_FILES" "$MIN_BYTES" "$REQUIRE_RW" <<'PY'
import json,sys,os
d=sys.argv[1]; vol=sys.argv[2]; dest=sys.argv[3]
min_files=int(sys.argv[4]); min_bytes=int(sys.argv[5]); require_rw=sys.argv[6]=="1"
fx=json.load(open(os.path.join(d,"gate.json")))
verdict=fx.get("expect_verdict") or "MEDIA_GATE_PASS"
mounts=fx.get("mounts") or []
m=next((x for x in mounts if x.get("Destination")==dest), None)
def fail(code,msg):
  print(json.dumps({"ok":False,"verdict":code,"message":msg},indent=2))
  raise SystemExit(1)
if m is None:
  fail("MEDIA_MOUNT_MISSING", f"no mount at {dest}")
if m.get("Name")!=vol:
  fail("MEDIA_VOLUME_MISMATCH", f"got={m.get('Name')}")
if require_rw and not m.get("RW", False):
  fail("MEDIA_VOLUME_MISMATCH", "mount_not_rw")
files=int(fx.get("file_count") or 0)
nbytes=int(fx.get("byte_size") or 0)
if files < min_files:
  fail("EMPTY_MEDIA", f"files={files}")
if nbytes < min_bytes:
  fail("EMPTY_MEDIA", f"bytes={nbytes}")
if not fx.get("has_jpeg"):
  fail("MISSING_REPRESENTATIVE", "jpeg")
if not fx.get("has_webp"):
  fail("MISSING_REPRESENTATIVE", "webp")
ps=fx.get("product_static_status")
if ps is not None and int(ps)!=200:
  fail("PRODUCT_STATIC_FAIL", f"status={ps}")
if verdict!="MEDIA_GATE_PASS" and fx.get("force_fail"):
  fail(verdict, fx.get("message") or verdict)
print(json.dumps({"ok":True,"verdict":"MEDIA_GATE_PASS","detail":{"fixture":d,"files":files,"bytes":nbytes}},indent=2))
PY
  exit $?
fi

assert_compose_declares_media

# Resolve container WITHOUT command-substitution (preserve WR_DISCOVERY_VERDICT)
if [[ -n "$CONTAINER_ARG" ]]; then
  export WOODRIGHT_BE_CONTAINER="$CONTAINER_ARG"
fi
if ! wr_discover_backend_container >/dev/null; then
  fail_json "${WR_DISCOVERY_VERDICT:-DISCOVERY_FAIL}" "backend discovery failed"
fi
BE="${WR_BE_CONTAINER}"
[[ -n "$BE" ]] || fail_json DISCOVERY_FAIL "empty WR_BE_CONTAINER"

# No published host ports on public backend (PortBindings must be empty)
PORT_BINDINGS=$(docker inspect "$BE" --format '{{json .HostConfig.PortBindings}}' 2>/dev/null || echo "")
if [[ -z "$PORT_BINDINGS" || ( "$PORT_BINDINGS" != "{}" && "$PORT_BINDINGS" != "null" ) ]]; then
  fail_json HOST_PORTS_PUBLISHED "PortBindings=$PORT_BINDINGS"
fi
# Also reject any HostIp:HostPort mapping in NetworkSettings.Ports
PORTS_JSON=$(docker inspect "$BE" --format '{{json .NetworkSettings.Ports}}' 2>/dev/null || true)
[[ -n "$PORTS_JSON" ]] || fail_json HOST_PORTS_PUBLISHED "NetworkSettings.Ports_unreadable"
PUBLISHED_HOST=$(printf '%s' "$PORTS_JSON" | python3 -c '
import json,sys
raw=sys.stdin.read()
try:
  ports=json.loads(raw)
except Exception:
  print("__PARSE_FAIL__"); raise SystemExit(0)
if ports is None:
  print("", end=""); raise SystemExit(0)
if not isinstance(ports, dict):
  print("__PARSE_FAIL__"); raise SystemExit(0)
hits=[]
for k,v in ports.items():
  if not v:
    continue
  for b in v:
    if b.get("HostPort"):
      hits.append("%s->%s:%s" % (k, b.get("HostIp") or "", b.get("HostPort")))
print(",".join(hits), end="")
')
[[ "$PUBLISHED_HOST" != "__PARSE_FAIL__" ]] || fail_json HOST_PORTS_PUBLISHED "NetworkSettings.Ports_parse_fail"
[[ -z "$PUBLISHED_HOST" ]] || fail_json HOST_PORTS_PUBLISHED "$PUBLISHED_HOST"

# Live volume content gates via docker exec into validated backend (no helper create/rm)
FILE_COUNT=$(docker exec "$BE" sh -c 'find /server/static -type f 2>/dev/null | wc -l' | tr -d ' ')
BYTE_SIZE=$(docker exec "$BE" sh -c 'du -sb /server/static 2>/dev/null | cut -f1' | tr -d ' ')
[[ "$FILE_COUNT" =~ ^[0-9]+$ ]] || fail_json EMPTY_MEDIA "files_unreadable"
[[ "$BYTE_SIZE" =~ ^[0-9]+$ ]] || fail_json EMPTY_MEDIA "bytes_unreadable"
[[ "$FILE_COUNT" -ge "$MIN_FILES" ]] || fail_json EMPTY_MEDIA "files=$FILE_COUNT"
[[ "$BYTE_SIZE" -ge "$MIN_BYTES" ]] || fail_json EMPTY_MEDIA "bytes=$BYTE_SIZE"

HAS_JPEG=$(docker exec "$BE" sh -c 'find /server/static -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) 2>/dev/null | head -1' || true)
HAS_WEBP=$(docker exec "$BE" sh -c 'find /server/static -type f -iname "*.webp" 2>/dev/null | head -1' || true)
[[ -n "$HAS_JPEG" ]] || fail_json MISSING_REPRESENTATIVE "jpeg"
[[ -n "$HAS_WEBP" ]] || fail_json MISSING_REPRESENTATIVE "webp"

# media_mount contract (same conditions monitoring uses for media_mount=pass)
MEDIA_MOUNT_OK=1
MOUNT_NAME=$(wr_container_mount_name_at "$BE" "$MEDIA_DEST")
MOUNT_RW=$(wr_container_mount_rw_at "$BE" "$MEDIA_DEST")
[[ "$MOUNT_NAME" == "$MEDIA_VOLUME" && "$MOUNT_RW" == "true" && "$FILE_COUNT" -ge "$MIN_FILES" ]] \
  || MEDIA_MOUNT_OK=0
[[ "$MEDIA_MOUNT_OK" -eq 1 ]] || fail_json MEDIA_MOUNT_MISSING "media_mount_contract_fail name=$MOUNT_NAME rw=$MOUNT_RW files=$FILE_COUNT"

PS_STATUS="skipped"
if [[ -n "$BUYER_HOST" ]]; then
  PS_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "${BUYER_HOST}${PRODUCT_STATIC_SAMPLE}" || echo 000)
  [[ "$PS_STATUS" == "200" ]] || fail_json PRODUCT_STATIC_FAIL "status=$PS_STATUS"
fi

ok_json "$(python3 -c 'import json,sys; print(json.dumps({"container":sys.argv[1],"volume":sys.argv[2],"files":int(sys.argv[3]),"bytes":int(sys.argv[4]),"product_static":sys.argv[5],"host_ports":"none","media_mount":"pass"}))' \
  "$BE" "$MEDIA_VOLUME" "$FILE_COUNT" "$BYTE_SIZE" "$PS_STATUS")"
