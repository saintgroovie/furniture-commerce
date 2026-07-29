#!/usr/bin/env bash
# Combined Woodright backup orchestrator. Retention only after full success.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/woodright-backup-root.sh
source "$SCRIPT_DIR/lib/woodright-backup-root.sh"
# shellcheck source=../lib/woodright-runtime-discovery.sh
source "$OPS_ROOT/lib/woodright-runtime-discovery.sh"

BACKUP_ROOT="${WOODRIGHT_BACKUP_ROOT:-/srv/woodright/backups/automated}"
ACTIVE_OWNER="${WOODRIGHT_ACTIVE_OWNER:-/srv/woodright/runtime-ownership/ACTIVE_OWNER.json}"
DISK_WARN_PCT="${WOODRIGHT_DISK_WARN_PCT:-75}"
DISK_CRIT_PCT="${WOODRIGHT_DISK_CRIT_PCT:-85}"
# SF/BE: explicit env override OR discovery (no ephemeral compose default names)
RUN_RETENTION="${WOODRIGHT_RUN_RETENTION:-1}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
ROOT_READY=0

log() {
  local msg
  msg="$(printf '%s %s' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*")"
  if [[ "$ROOT_READY" -eq 1 && -n "${LOG_FILE:-}" ]]; then
    printf '%s\n' "$msg" | tee -a "$LOG_FILE" >&2
  else
    printf '%s\n' "$msg" >&2
  fi
}
die() {
  log "ERROR: $*"
  if [[ "$ROOT_READY" -eq 1 ]]; then
    write_status failed "$*" || true
  fi
  exit 1
}

write_status() {
  [[ "$ROOT_READY" -eq 1 ]] || return 0
  local st="$1" msg="${2:-}"
  python3 - "$STATUS_FILE" "$st" "$msg" "$TS" <<'PY' || true
import json, sys, os, time
path, st, msg, ts = sys.argv[1:5]
os.makedirs(os.path.dirname(path), exist_ok=True)
obj = {"status": st, "timestamp_utc": ts, "message": msg, "written_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
with open(path, "w", encoding="utf-8") as f:
  json.dump(obj, f, indent=2)
  f.write("\n")
os.chmod(path, 0o600)
PY
}

wr_assert_backup_root "$BACKUP_ROOT" || exit 1
wr_ensure_dir "$BACKUP_ROOT" || exit 1
wr_ensure_dir "$BACKUP_ROOT/state" || exit 1
wr_ensure_dir "$BACKUP_ROOT/logs" || exit 1
wr_ensure_dir "$BACKUP_ROOT/manifests" || exit 1

LOCK="$BACKUP_ROOT/state/global.lock"
STATUS_FILE="$BACKUP_ROOT/state/last-run.json"
LOG_FILE="$BACKUP_ROOT/logs/backup-run-${TS}.log"
case "$LOCK" in
  "$BACKUP_ROOT"/state/*) ;;
  *) die "LOCK must be under BACKUP_ROOT/state" ;;
esac
ROOT_READY=1

exec 8>"$LOCK"
flock -n 8 || die "global backup lock held"

# Disk check on backup filesystem
USAGE=$(df -P "$BACKUP_ROOT" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
AVAIL=$(df -P "$BACKUP_ROOT" | awk 'NR==2 {print $4}')
log "disk usage=${USAGE}% avail_kb=$AVAIL root=$BACKUP_ROOT"
[[ "$USAGE" -lt "$DISK_CRIT_PCT" ]] || die "disk critical ${USAGE}% >= ${DISK_CRIT_PCT}%"
if [[ "$USAGE" -ge "$DISK_WARN_PCT" ]]; then
  log "WARN disk usage ${USAGE}% >= warn ${DISK_WARN_PCT}%"
fi

# Runtime identity (read-only) — discover public_demo pair fail-closed.
# Backup records *live* digests into the recovery-point; it must not chicken-egg
# on EXPECTED_RELEASE lagging a legitimate digest advance (DIGEST_MISMATCH).
# Keep container health/owner/media checks; only skip expected-digest gate here.
export WOODRIGHT_REQUIRE_EXPECTED_DIGEST=0
SF_CONTAINER=""
BE_CONTAINER=""
if ! wr_discover_storefront_container >/dev/null; then
  die "storefront discovery failed: ${WR_DISCOVERY_VERDICT:-unknown}"
fi
SF_CONTAINER="$WR_SF_CONTAINER"
if ! wr_discover_backend_container >/dev/null; then
  die "backend discovery failed: ${WR_DISCOVERY_VERDICT:-unknown}"
fi
BE_CONTAINER="$WR_BE_CONTAINER"
log "discovered sf=$SF_CONTAINER be=$BE_CONTAINER"

SF_DIGEST=$(docker inspect "$SF_CONTAINER" --format '{{index .Image}}' 2>/dev/null || echo unknown)
BE_DIGEST=$(docker inspect "$BE_CONTAINER" --format '{{index .Image}}' 2>/dev/null || echo unknown)
# Prefer RepoDigest when available
SF_REPO=$(docker inspect "$SF_CONTAINER" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null | head -1 || true)
BE_REPO=$(docker inspect "$BE_CONTAINER" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null | head -1 || true)
GIT_SHA="unknown"
if [[ -f "$ACTIVE_OWNER" ]]; then
  GIT_SHA=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("desired_git_sha") or d.get("approved_git_sha") or d.get("git_sha") or "unknown")' "$ACTIVE_OWNER" 2>/dev/null || echo unknown)
fi
OWNER_SHA=""
[[ -f "$ACTIVE_OWNER" ]] && OWNER_SHA=$(sha256sum "$ACTIVE_OWNER" | awk '{print $1}')

log "identity sf=$SF_DIGEST be=$BE_DIGEST git=$GIT_SHA"

# PostgreSQL readiness
PG_CONTAINER="${WOODRIGHT_PG_CONTAINER:-woodright-stack-3dsdhd-postgres-1}"
docker exec "$PG_CONTAINER" pg_isready -U "${WOODRIGHT_PG_USER:-woodright}" >/dev/null \
  || die "pg_isready failed"

START=$(date +%s)
log "postgres backup begin"
PG_OUT=$("$SCRIPT_DIR/woodright-postgres-backup.sh" | tee -a "$LOG_FILE" | tail -1)
[[ -f "$PG_OUT" ]] || die "postgres backup path missing"
PG_SHA=$(sha256sum "$PG_OUT" | awk '{print $1}')
log "postgres backup ok path=$(basename "$PG_OUT")"

log "media backup begin"
MEDIA_OUT=$("$SCRIPT_DIR/woodright-media-backup.sh" | tee -a "$LOG_FILE" | tail -1)
[[ -f "$MEDIA_OUT" ]] || die "media backup path missing"
MEDIA_SHA=$(sha256sum "$MEDIA_OUT" | awk '{print $1}')
log "media backup ok path=$(basename "$MEDIA_OUT")"

# Combined recovery-point manifest
COMBINED="$BACKUP_ROOT/manifests/recovery-point-${TS}.json"
MEDIA_SIG=$(python3 -c 'import json,glob,sys; ms=sorted(glob.glob(sys.argv[1]+"/manifests/*media.json"))[-1]; print(json.load(open(ms)).get("media_mount_signature",""))' "$BACKUP_ROOT" 2>/dev/null || echo "")

python3 - "$COMBINED" "$TS" "$GIT_SHA" "$SF_DIGEST" "$BE_DIGEST" "$PG_OUT" "$PG_SHA" "$MEDIA_OUT" "$MEDIA_SHA" "$MEDIA_SIG" "$OWNER_SHA" <<'PY'
import json, sys, os
(path, ts, git, sf, be, pg, pg_sha, media, media_sha, media_sig, owner_sha) = sys.argv[1:]
obj = {
  "kind": "woodright_recovery_point",
  "status": "success",
  "timestamp_utc": ts,
  "git_sha": git,
  "storefront_digest": sf,
  "backend_digest": be,
  "postgres": {"path": pg, "sha256": pg_sha},
  "media": {"path": media, "sha256": media_sha},
  "media_mount_signature": media_sig or None,
  "active_owner_sha256": owner_sha or None,
  "script": "woodright-backup-run.sh",
  "script_version": 1,
}
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
  json.dump(obj, f, indent=2)
  f.write("\n")
os.chmod(path, 0o600)
print(path)
PY

END=$(date +%s)
DUR=$((END - START))
log "combined manifest ok duration=${DUR}s"

if [[ "$RUN_RETENTION" == "1" ]]; then
  log "retention begin"
  "$SCRIPT_DIR/woodright-backup-retention.sh" --apply || die "retention failed"
  log "retention ok"
fi

write_status success "recovery-point=${TS} duration=${DUR}s"
log "backup-run complete"
printf '%s\n' "$COMBINED"
