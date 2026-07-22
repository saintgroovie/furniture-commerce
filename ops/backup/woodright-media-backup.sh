#!/usr/bin/env bash
# Woodright media backup. Never deletes source. Fails on missing/empty mount.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/woodright-backup-root.sh
source "$SCRIPT_DIR/lib/woodright-backup-root.sh"

BACKUP_ROOT="${WOODRIGHT_BACKUP_ROOT:-/srv/woodright/backups/automated}"
MEDIA_VOLUME="${WOODRIGHT_MEDIA_VOLUME:-woodright-stack-3dsdhd_woodright_staging_media}"
MEDIA_MOUNT_IN_BE="${WOODRIGHT_MEDIA_MOUNT_IN_BE:-/server/static}"
BE_CONTAINER="${WOODRIGHT_BE_CONTAINER:-woodright-stack-3dsdhd-backend-1}"
MIN_FILES="${WOODRIGHT_MEDIA_MIN_FILES:-100}"
MIN_BYTES="${WOODRIGHT_MEDIA_MIN_BYTES:-1048576}"
ACTIVE_OWNER="${WOODRIGHT_ACTIVE_OWNER:-/srv/woodright/runtime-ownership/ACTIVE_OWNER.json}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
WEEK="$(date -u +%G-W%V)"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

wr_assert_backup_root "$BACKUP_ROOT" || exit 1
wr_ensure_dir "$BACKUP_ROOT" || exit 1
for d in media media/daily media/weekly manifests logs state quarantine; do
  wr_ensure_dir "$BACKUP_ROOT/$d" || exit 1
done

LOCK_FILE="${WOODRIGHT_MEDIA_LOCK:-$BACKUP_ROOT/state/media.lock}"
case "$LOCK_FILE" in
  "$BACKUP_ROOT"/state/*) ;;
  *) die "LOCK_FILE must be under BACKUP_ROOT/state" ;;
esac
if [[ -L "$LOCK_FILE" ]]; then
  die "LOCK_FILE must not be a symlink"
fi
lock_dir=$(dirname "$LOCK_FILE")
[[ -L "$lock_dir" ]] && die "lock dir is symlink"
wr_under_root "$lock_dir" || die "LOCK_FILE outside BACKUP_ROOT: refused"

exec 9>"$LOCK_FILE"
flock -n 9 || die "media backup lock held"

# Prove mount from backend inspect (JSON - no field ambiguity)
MOUNT_SRC=$(docker inspect "$BE_CONTAINER" --format '{{json .Mounts}}' \
  | python3 -c 'import json,sys; dest=sys.argv[1]; mounts=json.load(sys.stdin);
print(next((m.get("Name") or "") for m in mounts if m.get("Destination")==dest), end="")' \
  "$MEDIA_MOUNT_IN_BE")
[[ -n "$MOUNT_SRC" ]] || die "media mount missing at $MEDIA_MOUNT_IN_BE in $BE_CONTAINER"
[[ "$MOUNT_SRC" == "$MEDIA_VOLUME" ]] || die "unexpected media volume: got=$MOUNT_SRC want=$MEDIA_VOLUME"

# Count via temporary helper container (read-only volume mount)
HELPER="woodright-media-backup-helper-$$"
cleanup_helper() { docker rm -f "$HELPER" >/dev/null 2>&1 || true; }
trap cleanup_helper EXIT

docker run -d --name "$HELPER" \
  --network none \
  -v "${MEDIA_VOLUME}:/media:ro" \
  alpine:3.20 sleep 3600 >/dev/null

FILE_COUNT=$(docker exec "$HELPER" sh -c 'find /media -type f | wc -l' | tr -d ' ')
BYTE_SIZE=$(docker exec "$HELPER" sh -c 'du -sb /media | cut -f1' | tr -d ' ')
[[ "$FILE_COUNT" -ge "$MIN_FILES" ]] || die "media file count too low: $FILE_COUNT < $MIN_FILES"
[[ "$BYTE_SIZE" -ge "$MIN_BYTES" ]] || die "media byte size too low: $BYTE_SIZE < $MIN_BYTES"

# Mount signature (inode/dev of volume root + count/size)
SIG=$(docker exec "$HELPER" sh -c 'stat -c "%d:%i:%s" /media 2>/dev/null || stat -f "%d:%i:%z" /media')
MOUNT_SIG="${MEDIA_VOLUME}|${MEDIA_MOUNT_IN_BE}|files=${FILE_COUNT}|bytes=${BYTE_SIZE}|stat=${SIG}"

START=$(date +%s)
OUT_DIR="$BACKUP_ROOT/media/daily"
OUT_BASE="woodright_media_${TS}"
TMP="$OUT_DIR/.partial_${OUT_BASE}.tar.gz"
FINAL="$OUT_DIR/${OUT_BASE}.tar.gz"
SHA_FILE="$OUT_DIR/${OUT_BASE}.tar.gz.sha256"
MAN="$BACKUP_ROOT/manifests/${OUT_BASE}.media.json"
LIST="$OUT_DIR/${OUT_BASE}.list.txt"

rm -f "$TMP"
log "media archive start files=$FILE_COUNT bytes=$BYTE_SIZE"

# Create archive inside helper, stream out
if ! docker exec "$HELPER" sh -c 'cd /media && tar -czf - .' >"$TMP"; then
  mkdir -p "$BACKUP_ROOT/quarantine"
  mv -f "$TMP" "$BACKUP_ROOT/quarantine/${OUT_BASE}.tar.gz.failed" 2>/dev/null || rm -f "$TMP"
  die "media tar failed"
fi

SIZE=$(wc -c <"$TMP" | tr -d ' ')
[[ "$SIZE" -gt 0 ]] || die "empty media archive"

# Integrity list (paths only)
tar -tzf "$TMP" >"$LIST" || die "tar list failed"
LIST_COUNT=$(wc -l <"$LIST" | tr -d ' ')
[[ "$LIST_COUNT" -gt 0 ]] || die "empty archive listing"

chmod 0600 "$TMP" "$LIST"
SHA=$(sha256sum "$TMP" | awk '{print $1}')
printf '%s  %s\n' "$SHA" "$(basename "$FINAL")" >"$SHA_FILE"
chmod 0600 "$SHA_FILE"
mv -f "$TMP" "$FINAL"
chmod 0600 "$FINAL"

WEEKLY="$BACKUP_ROOT/media/weekly/${OUT_BASE}.tar.gz"
if [[ ! -e "$BACKUP_ROOT/media/weekly/woodright_media_${WEEK}.marker" ]]; then
  cp -an "$FINAL" "$WEEKLY" 2>/dev/null || cp -a "$FINAL" "$WEEKLY"
  cp -an "$SHA_FILE" "${WEEKLY}.sha256" 2>/dev/null || cp -a "$SHA_FILE" "${WEEKLY}.sha256"
  touch "$BACKUP_ROOT/media/weekly/woodright_media_${WEEK}.marker"
  chmod 0600 "$WEEKLY" "${WEEKLY}.sha256" 2>/dev/null || true
fi

END=$(date +%s)
DUR=$((END - START))
OWNER_SHA=""
[[ -f "$ACTIVE_OWNER" ]] && OWNER_SHA=$(sha256sum "$ACTIVE_OWNER" | awk '{print $1}')

# Prove source unchanged (same count) before success manifest
AFTER=$(docker exec "$HELPER" sh -c 'find /media -type f | wc -l' | tr -d ' ')
[[ "$AFTER" == "$FILE_COUNT" ]] || die "source file count changed during backup"

python3 - "$MAN" "$TS" "$FINAL" "$SHA" "$SIZE" "$DUR" "$FILE_COUNT" "$BYTE_SIZE" "$MOUNT_SIG" "$OWNER_SHA" <<'PY'
import json, sys, os
man, ts, path, sha, size, dur, files, bytes_, mount_sig, owner_sha = sys.argv[1:]
obj = {
  "kind": "woodright_media_backup",
  "status": "success",
  "timestamp_utc": ts,
  "path": path,
  "sha256": sha,
  "archive_size_bytes": int(size),
  "source_file_count": int(files),
  "source_bytes": int(bytes_),
  "duration_sec": int(dur),
  "media_mount_signature": mount_sig,
  "active_owner_sha256": owner_sha or None,
  "script": "woodright-media-backup.sh",
  "script_version": 1,
}
os.makedirs(os.path.dirname(man), exist_ok=True)
with open(man, "w", encoding="utf-8") as f:
  json.dump(obj, f, indent=2)
  f.write("\n")
os.chmod(man, 0o600)
print(man)
PY

log "media archive ok size=$SIZE sha256=$SHA files=$FILE_COUNT duration=${DUR}s"
printf '%s\n' "$FINAL"
