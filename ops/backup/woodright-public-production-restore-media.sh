#!/usr/bin/env bash
# Restore a catalog media archive into the isolated public_production media volume.
#
# Source is an immutable tar.gz (typically the daily /server/static backup).
# Destination MUST be woodright-public-production_woodright_public_media.
# Never mounts or writes staging/demo media volumes.
#
# Usage (on the Timeweb host):
#   bash ops/backup/woodright-public-production-restore-media.sh \
#     --confirm-restore-media \
#     --archive /path/to/woodright_media_*.tar.gz \
#     --expected-sha256 <64hex>
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../lib/woodright-restore-target-guard.sh
source "$OPS_ROOT/lib/woodright-restore-target-guard.sh"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

CONFIRM=0
ARCHIVE=""
EXPECTED_SHA=""
DEST_VOLUME="woodright-public-production_woodright_public_media"
REPORT_DIR="${WOODRIGHT_RESTORE_REPORT_DIR:-/srv/woodright/reports/public_production/restore-media}"
HELPER=""

usage() { sed -n '2,16p' "$0"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm-restore-media) CONFIRM=1; shift ;;
    --archive) ARCHIVE="${2:-}"; shift 2 ;;
    --expected-sha256) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --dest-volume) DEST_VOLUME="${2:-}"; shift 2 ;;
    --report-dir) REPORT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ "$CONFIRM" == "1" ]] || die "refusing without --confirm-restore-media"
[[ -n "$ARCHIVE" && -f "$ARCHIVE" ]] || die "--archive required and must be a regular file"
[[ ! -L "$ARCHIVE" ]] || die "archive must not be a symlink"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{64}$ ]] || die "--expected-sha256 must be 64 lowercase hex"

wr_assert_public_production_media_volume "$DEST_VOLUME" || die "media dest refused"

command -v docker >/dev/null || die "docker required"
docker volume inspect "$DEST_VOLUME" >/dev/null 2>&1 || die "dest volume missing: $DEST_VOLUME"

# Refuse if dest name equals any live staging media mount.
if docker inspect woodright-staging-backend >/dev/null 2>&1; then
  staging_media="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/server/static"}}{{.Name}}{{end}}{{end}}' woodright-staging-backend 2>/dev/null || true)"
  [[ "$DEST_VOLUME" != "$staging_media" ]] || die "RESTORE_MEDIA_DEST_IS_STAGING_VOLUME"
fi

ACTUAL_SHA="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || die "archive sha256 mismatch actual=$ACTUAL_SHA expected=$EXPECTED_SHA"

HELPER="wr-pp-media-restore-$$"
cleanup() {
  if [[ -n "$HELPER" ]]; then
    docker rm -f "$HELPER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker run -d --name "$HELPER" --network none \
  -v "${DEST_VOLUME}:/dest" \
  alpine:3.20 sleep 3600 >/dev/null

EXISTING="$(docker exec "$HELPER" sh -c 'set -euo pipefail; find /dest -mindepth 1 | wc -l' | tr -d ' ')"
[[ "$EXISTING" == "0" ]] || die "dest volume not empty entries=$EXISTING (refusing overwrite)"

log "extract archive into $DEST_VOLUME"
docker cp "$ARCHIVE" "$HELPER:/tmp/media.tar.gz"
docker exec "$HELPER" sh -c 'tar -xzf /tmp/media.tar.gz -C /dest && rm -f /tmp/media.tar.gz'
docker exec "$HELPER" sh -c 'chown -R 10001:10001 /dest 2>/dev/null || true'

FILE_COUNT="$(docker exec "$HELPER" sh -c 'set -euo pipefail; find /dest -type f | wc -l' | tr -d ' ')"
BYTE_SIZE="$(docker exec "$HELPER" sh -c 'set -euo pipefail; du -sb /dest | cut -f1' | tr -d ' ')"
[[ "$FILE_COUNT" -ge 100 ]] || die "extracted file count too low: $FILE_COUNT"
[[ "$BYTE_SIZE" -ge 1048576 ]] || die "extracted byte size too low: $BYTE_SIZE"
SAMPLE="$(docker exec "$HELPER" sh -c 'test -f /dest/products/provence/pv-15-1-i1.jpg && echo ok' || true)"
[[ "$SAMPLE" == "ok" ]] || die "expected catalog sample missing after extract"

mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR" 2>/dev/null || true
TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$REPORT_DIR/restore-media-${TS}.json"
python3 - "$REPORT" "$ACTUAL_SHA" "$DEST_VOLUME" "$FILE_COUNT" "$BYTE_SIZE" <<'PY'
import json, sys, datetime
path, sha, vol, files, bytes_ = sys.argv[1:6]
json.dump({
  "schema": "woodright.public_production.restore_media.v1",
  "created_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "archive_sha256": sha,
  "dest_volume": vol,
  "file_count": int(files),
  "byte_size": int(bytes_),
  "staging_volume_mutated": False,
}, open(path, "w"), indent=2)
print(path)
PY

log "PUBLIC_PRODUCTION_RESTORE_MEDIA_OK files=$FILE_COUNT bytes=$BYTE_SIZE volume=$DEST_VOLUME"
