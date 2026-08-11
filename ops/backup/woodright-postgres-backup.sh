#!/usr/bin/env bash
# Woodright PostgreSQL backup (custom-format). No PII / no connection strings in logs.
# LIVE_MUTATING=false for application runtime; writes only under BACKUP_ROOT.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/woodright-backup-root.sh
source "$SCRIPT_DIR/lib/woodright-backup-root.sh"

BACKUP_ROOT="${WOODRIGHT_BACKUP_ROOT:-/srv/woodright/backups/automated}"
PG_CONTAINER="${WOODRIGHT_PG_CONTAINER:-woodright-stack-3dsdhd-postgres-1}"
PG_USER="${WOODRIGHT_PG_USER:-woodright}"
PG_DB="${WOODRIGHT_PG_DB:-woodright_staging}"
ACTIVE_OWNER="${WOODRIGHT_ACTIVE_OWNER:-/srv/woodright/runtime-ownership/ACTIVE_OWNER.json}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
WEEK="$(date -u +%G-W%V)"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

wr_assert_backup_root "$BACKUP_ROOT" || exit 1
wr_ensure_dir "$BACKUP_ROOT" || exit 1
for d in postgres postgres/daily postgres/weekly manifests logs state quarantine; do
  wr_ensure_dir "$BACKUP_ROOT/$d" || exit 1
done

LOCK_FILE="${WOODRIGHT_BACKUP_LOCK:-$BACKUP_ROOT/state/postgres.lock}"
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
flock -n 9 || die "postgres backup lock held"

docker inspect "$PG_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -qx true \
  || die "postgres container not running: $PG_CONTAINER"

START=$(date +%s)
OUT_DIR="$BACKUP_ROOT/postgres/daily"
OUT_BASE="woodright_${PG_DB}_${TS}"
TMP="$OUT_DIR/.partial_${OUT_BASE}.dump"
FINAL="$OUT_DIR/${OUT_BASE}.dump"
LIST="$OUT_DIR/${OUT_BASE}.list.txt"
MAN="$BACKUP_ROOT/manifests/${OUT_BASE}.postgres.json"
SHA_FILE="$OUT_DIR/${OUT_BASE}.dump.sha256"

rm -f "$TMP"
log "pg_dump start container=$PG_CONTAINER db=$PG_DB"

# Stream dump (password stays inside container auth; not logged).
if ! docker exec -i "$PG_CONTAINER" \
  pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner --no-acl >"$TMP"; then
  mkdir -p "$BACKUP_ROOT/quarantine"
  mv -f "$TMP" "$BACKUP_ROOT/quarantine/${OUT_BASE}.dump.failed" 2>/dev/null || rm -f "$TMP"
  die "pg_dump failed"
fi

SIZE=$(wc -c <"$TMP" | tr -d ' ')
[[ "$SIZE" -gt 0 ]] || die "empty dump"

# TOC list (no row data). Copy into container — Alpine pg_restore rejects stdin "-".
LIST_IN="/tmp/wr-pg-backup-list-${TS}.dump"
docker cp "$TMP" "${PG_CONTAINER}:${LIST_IN}"
if ! docker exec "$PG_CONTAINER" pg_restore -l "$LIST_IN" >"$LIST" 2>"$BACKUP_ROOT/logs/pg-restore-list-${TS}.err"; then
  docker exec "$PG_CONTAINER" rm -f "$LIST_IN" >/dev/null 2>&1 || true
  mkdir -p "$BACKUP_ROOT/quarantine"
  mv -f "$TMP" "$BACKUP_ROOT/quarantine/${OUT_BASE}.dump.badlist" 2>/dev/null || true
  die "pg_restore --list failed"
fi
docker exec "$PG_CONTAINER" rm -f "$LIST_IN" >/dev/null 2>&1 || true
rm -f "$BACKUP_ROOT/logs/pg-restore-list-${TS}.err"
chmod 0600 "$TMP" "$LIST"

SHA=$(sha256sum "$TMP" | awk '{print $1}')
printf '%s  %s\n' "$SHA" "$(basename "$FINAL")" >"$SHA_FILE"
chmod 0600 "$SHA_FILE"

mv -f "$TMP" "$FINAL"
chmod 0600 "$FINAL"

# Weekly copy (hardlink if same FS)
WEEKLY="$BACKUP_ROOT/postgres/weekly/${OUT_BASE}.dump"
if [[ ! -e "$BACKUP_ROOT/postgres/weekly/woodright_${PG_DB}_${WEEK}.marker" ]]; then
  cp -an "$FINAL" "$WEEKLY" 2>/dev/null || cp -a "$FINAL" "$WEEKLY"
  cp -an "$SHA_FILE" "${WEEKLY}.sha256" 2>/dev/null || cp -a "$SHA_FILE" "${WEEKLY}.sha256"
  touch "$BACKUP_ROOT/postgres/weekly/woodright_${PG_DB}_${WEEK}.marker"
  chmod 0600 "$WEEKLY" "${WEEKLY}.sha256" 2>/dev/null || true
fi

END=$(date +%s)
DUR=$((END - START))
PG_VER=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc 'SHOW server_version;' 2>/dev/null | tr -d '[:space:]' || echo unknown)

OWNER_SHA=""
if [[ -f "$ACTIVE_OWNER" ]]; then
  OWNER_SHA=$(sha256sum "$ACTIVE_OWNER" | awk '{print $1}')
fi

python3 - "$MAN" "$TS" "$FINAL" "$SHA" "$SIZE" "$DUR" "$PG_VER" "$OWNER_SHA" "$PG_DB" <<'PY'
import json, sys, os
man, ts, path, sha, size, dur, ver, owner_sha, db = sys.argv[1:]
obj = {
  "kind": "woodright_postgres_backup",
  "status": "success",
  "timestamp_utc": ts,
  "database": db,
  "format": "custom",
  "path": path,
  "sha256": sha,
  "size_bytes": int(size),
  "duration_sec": int(dur),
  "postgres_version": ver,
  "active_owner_sha256": owner_sha or None,
  "script": "woodright-postgres-backup.sh",
  "script_version": 1,
}
os.makedirs(os.path.dirname(man), exist_ok=True)
with open(man, "w", encoding="utf-8") as f:
  json.dump(obj, f, indent=2)
  f.write("\n")
os.chmod(man, 0o600)
print(man)
PY

log "pg_dump ok size=$SIZE sha256=$SHA duration=${DUR}s"
printf '%s\n' "$FINAL"
