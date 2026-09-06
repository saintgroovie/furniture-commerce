#!/usr/bin/env bash
# Public-production backup orchestrator (repository contract).
# Requires --environment public_production. Never falls back to demo/candidate DB/media.
# Plan-only mode (WOODRIGHT_BACKUP_PLAN_ONLY=1) validates identity/isolation without Docker.
# Live backup refuses when environment is unprovisioned or authority identity is inconsistent.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=lib/woodright-backup-root.sh
source "$SCRIPT_DIR/lib/woodright-backup-root.sh"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$OPS_ROOT/lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-ops-path-isolation.sh
source "$OPS_ROOT/lib/woodright-ops-path-isolation.sh"
# shellcheck source=../lib/woodright-recovery-point.sh
source "$OPS_ROOT/lib/woodright-recovery-point.sh"
# shellcheck source=../lib/woodright-runtime-discovery.sh
source "$OPS_ROOT/lib/woodright-runtime-discovery.sh"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

wr_require_environment_from_args "$@" || exit 1
[[ "${WOODRIGHT_ENVIRONMENT}" == "public_production" ]] \
  || die "this helper only accepts --environment public_production"

wr_require_canonical_db_identity || exit 1
wr_assert_public_production_path_isolation || exit 1

BACKUP_ROOT="${WOODRIGHT_BACKUP_ROOT}"
ACTIVE_OWNER="${WOODRIGHT_ACTIVE_OWNER}"
PG_CONTAINER="${WOODRIGHT_PG_CONTAINER:-${WOODRIGHT_PG_CONTAINER_PREFIX:-woodright-public-production-postgres}}"
PG_USER="${WOODRIGHT_PG_USER:-woodright}"
PG_DB="${WOODRIGHT_DB_NAME}"
MEDIA_VOLUME="${WOODRIGHT_MEDIA_VOLUME}"
PLAN_ONLY="${WOODRIGHT_BACKUP_PLAN_ONLY:-0}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
RP_ID="rp-public-production-${TS}"

# Refuse demo/candidate defaults
case "$PG_DB" in
  woodright_staging|woodright_production|woodright_candidate*)
    die "refusing non-public-production DB name=$PG_DB"
    ;;
esac
case "$BACKUP_ROOT" in
  */public-demo*|*/production-candidate*|*/automated)
    [[ "$BACKUP_ROOT" == */automated/public-production* ]] || die "refusing shared/demo/candidate BACKUP_ROOT=$BACKUP_ROOT"
    ;;
esac
case "$MEDIA_VOLUME" in
  *staging*|*candidate*|woodright-stack-*)
    die "refusing non-public-production media volume=$MEDIA_VOLUME"
    ;;
esac

# Authority consistency: live and plan both require coherent identity pins;
# live backup additionally requires a non-symlink ACTIVE_OWNER with matching env.
if [[ -L "$ACTIVE_OWNER" ]]; then
  die "ACTIVE_OWNER must not be a symlink"
fi
if [[ "$PLAN_ONLY" != "1" ]]; then
  [[ -f "$ACTIVE_OWNER" ]] || die "ACTIVE_OWNER missing: $ACTIVE_OWNER"
  OWNER_ENV=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("environment") or d.get("env") or "")' "$ACTIVE_OWNER" 2>/dev/null || true)
  [[ "$OWNER_ENV" == "public_production" ]] || die "ACTIVE_OWNER environment mismatch: '${OWNER_ENV:-empty}'"
  OWNER_SHA=$(sha256sum "$ACTIVE_OWNER" | awk '{print $1}')
  [[ -n "$OWNER_SHA" ]] || die "ACTIVE_OWNER checksum empty"
else
  if [[ -f "$ACTIVE_OWNER" ]]; then
    OWNER_ENV=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d.get("environment") or d.get("env") or "")' "$ACTIVE_OWNER" 2>/dev/null || true)
    if [[ -n "$OWNER_ENV" && "$OWNER_ENV" != "public_production" ]]; then
      die "ACTIVE_OWNER environment mismatch: $OWNER_ENV"
    fi
  fi
fi

if [[ "$PLAN_ONLY" == "1" ]]; then
  log "PLAN_ONLY=1 environment=public_production backup_root=$BACKUP_ROOT db=$PG_DB alias=$WOODRIGHT_REQUIRED_DB_ALIAS media=$MEDIA_VOLUME"
  cat <<EOF
{
  "kind": "woodright_backup_plan",
  "environment": "public_production",
  "status": "plan_ok",
  "backup_root": "$BACKUP_ROOT",
  "db_alias": "$WOODRIGHT_REQUIRED_DB_ALIAS",
  "db_name": "$PG_DB",
  "pg_container": "$PG_CONTAINER",
  "media_volume": "$MEDIA_VOLUME",
  "recovery_point_id": "$RP_ID",
  "provisioned": ${WOODRIGHT_ENVIRONMENT_PROVISIONED:-0},
  "live_backup": false
}
EOF
  exit 0
fi

# Live backup requires provisioned runtime
wr_assert_environment_provisioned || die "public_production unprovisioned; refuse live backup"

wr_assert_backup_root "$BACKUP_ROOT" || exit 1
wr_ensure_dir "$BACKUP_ROOT" || exit 1
wr_ensure_dir "$BACKUP_ROOT/state" || exit 1
wr_ensure_dir "$BACKUP_ROOT/logs" || exit 1
wr_ensure_dir "$BACKUP_ROOT/manifests" || exit 1

LOCK="$BACKUP_ROOT/state/global.lock"
if [[ -L "$LOCK" || -L "$BACKUP_ROOT/state" ]]; then
  die "lock/state must not be symlinks"
fi
exec 8>"$LOCK"
flock -n 8 || die "global backup lock held"

# Discovery must match public_production prefixes
export WOODRIGHT_REQUIRE_EXPECTED_DIGEST=0
export WOODRIGHT_BE_CONTAINER="${WOODRIGHT_BE_CONTAINER:-$WOODRIGHT_BE_CONTAINER_DEFAULT}"
export WOODRIGHT_SF_CONTAINER="${WOODRIGHT_SF_CONTAINER:-$WOODRIGHT_SF_CONTAINER_DEFAULT}"
export WOODRIGHT_MEDIA_VOLUME="$MEDIA_VOLUME"
export WOODRIGHT_PG_CONTAINER="$PG_CONTAINER"
export WOODRIGHT_PG_DB="$PG_DB"
export WOODRIGHT_BACKUP_ROOT="$BACKUP_ROOT"
export WOODRIGHT_ACTIVE_OWNER="$ACTIVE_OWNER"

if ! wr_discover_storefront_container >/dev/null; then
  die "storefront discovery failed: ${WR_DISCOVERY_VERDICT:-unknown}"
fi
SF_CONTAINER="$WR_SF_CONTAINER"
wr_assert_container_matches_environment "$SF_CONTAINER" storefront || die "storefront identity mismatch"
if ! wr_discover_backend_container >/dev/null; then
  die "backend discovery failed: ${WR_DISCOVERY_VERDICT:-unknown}"
fi
BE_CONTAINER="$WR_BE_CONTAINER"
wr_assert_container_matches_environment "$BE_CONTAINER" backend || die "backend identity mismatch"

SF_DIGEST=$(docker inspect "$SF_CONTAINER" --format '{{.Image}}' 2>/dev/null || echo unknown)
BE_DIGEST=$(docker inspect "$BE_CONTAINER" --format '{{.Image}}' 2>/dev/null || echo unknown)
APP_SHA=$(docker inspect "$SF_CONTAINER" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || echo unknown)
[[ -n "$OWNER_SHA" ]] || OWNER_SHA=$(sha256sum "$ACTIVE_OWNER" | awk '{print $1}')
[[ -n "$OWNER_SHA" ]] || die "owner approval checksum required for live backup"

docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" >/dev/null || die "pg_isready failed"

log "postgres backup begin"
PG_OUT=$("$SCRIPT_DIR/woodright-postgres-backup.sh" | tee -a "$BACKUP_ROOT/logs/backup-run-${TS}.log" | tail -1)
[[ -f "$PG_OUT" ]] || die "postgres backup path missing"
[[ ! -L "$PG_OUT" ]] || die "postgres dump must not be symlink"
PG_SHA=$(sha256sum "$PG_OUT" | awk '{print $1}')
PG_SIZE=$(wc -c <"$PG_OUT" | tr -d ' ')

log "media backup begin"
MEDIA_OUT=$("$SCRIPT_DIR/woodright-media-backup.sh" | tee -a "$BACKUP_ROOT/logs/backup-run-${TS}.log" | tail -1)
[[ -f "$MEDIA_OUT" ]] || die "media backup path missing"
[[ ! -L "$MEDIA_OUT" ]] || die "media archive must not be symlink"
MEDIA_SHA=$(sha256sum "$MEDIA_OUT" | awk '{print $1}')
MEDIA_SIZE=$(wc -c <"$MEDIA_OUT" | tr -d ' ')
MEDIA_FILES=$(python3 -c 'import json,glob,sys; ms=sorted(glob.glob(sys.argv[1]+"/manifests/*media.json"))[-1]; d=json.load(open(ms)); print(d.get("file_count") or d.get("source_file_count") or 0)' "$BACKUP_ROOT" 2>/dev/null || echo 0)
[[ "${MEDIA_FILES}" -gt 0 ]] || die "media file_count missing/zero in component manifest"
PG_VER=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc 'SHOW server_version;' 2>/dev/null | tr -d '[:space:]' || echo unknown)

COMBINED="$BACKUP_ROOT/manifests/recovery-point-${TS}.json"
wr_build_recovery_point_v2_json \
  "public_production" "$RP_ID" "$TS" "$APP_SHA" "$BE_DIGEST" "$SF_DIGEST" \
  "${WOODRIGHT_OPS_SHA:-}" "$OWNER_SHA" \
  "$WOODRIGHT_REQUIRED_DB_ALIAS" "$PG_DB" "$PG_OUT" "$PG_SHA" "$PG_SIZE" \
  "$MEDIA_OUT" "$MEDIA_SHA" "$MEDIA_SIZE" "$MEDIA_FILES" \
  "$PG_VER" "${WOODRIGHT_MIGRATION_HEAD:-}" \
  "${WOODRIGHT_LEGAL_CONTENT_STATUS:-}" \
  "${WOODRIGHT_PAYMENT_DECISION_STATUS:-}" \
  "${WOODRIGHT_NOTIFICATION_DECISION_STATUS:-}" \
  "${USER:-ops}" "pending_rehearsal" >"$COMBINED"
chmod 0600 "$COMBINED"
wr_validate_recovery_point_manifest "$COMBINED" || die "recovery-point validation failed"

if [[ "${WOODRIGHT_RUN_RETENTION:-1}" == "1" ]]; then
  log "retention begin"
  "$SCRIPT_DIR/woodright-backup-retention.sh" --apply || die "retention failed"
  log "retention ok"
fi

log "public_production backup complete recovery_point=$RP_ID"
printf '%s\n' "$COMBINED"
