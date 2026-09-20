#!/usr/bin/env bash
# Live restore of a custom-format (-Fc) dump into isolated public_production Postgres.
#
# This is NOT catalog promotion (no customer/order scrub).
# This is NOT restore rehearsal (disposable container).
# This is NOT a restore into woodright-staging-postgres / woodright_staging.
#
# Usage (on the Timeweb host, after isolated postgres is up):
#   bash ops/backup/woodright-public-production-restore-dump.sh \
#     --confirm-restore \
#     --dump /path/to/woodright_public_production.dump \
#     --expected-sha256 <64hex>
#
# Exit: 0 ok | 1 failure | 2 usage
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../lib/woodright-restore-target-guard.sh
source "$OPS_ROOT/lib/woodright-restore-target-guard.sh"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

CONFIRM=0
DUMP=""
EXPECTED_SHA=""
TARGET_CONTAINER="woodright-public-production-postgres"
TARGET_DB="woodright_public_production"
TARGET_USER="woodright"
REPORT_DIR="${WOODRIGHT_RESTORE_REPORT_DIR:-/srv/woodright/reports/public_production/restore-dump}"

usage() {
  sed -n '2,20p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm-restore) CONFIRM=1; shift ;;
    --dump) DUMP="${2:-}"; shift 2 ;;
    --expected-sha256) EXPECTED_SHA="${2:-}"; shift 2 ;;
    --target-container) TARGET_CONTAINER="${2:-}"; shift 2 ;;
    --target-db) TARGET_DB="${2:-}"; shift 2 ;;
    --target-user) TARGET_USER="${2:-}"; shift 2 ;;
    --report-dir) REPORT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ "$CONFIRM" == "1" ]] || die "refusing without --confirm-restore"
[[ -n "$DUMP" && -f "$DUMP" ]] || die "--dump required and must be a regular file"
[[ ! -L "$DUMP" ]] || die "dump must not be a symlink"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{64}$ ]] || die "--expected-sha256 must be 64 lowercase hex"

command -v docker >/dev/null || die "docker required"
command -v sha256sum >/dev/null || die "sha256sum required"

ACTUAL_SHA="$(sha256sum "$DUMP" | awk '{print $1}')"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || die "dump sha256 mismatch actual=$ACTUAL_SHA expected=$EXPECTED_SHA"

docker inspect "$TARGET_CONTAINER" >/dev/null 2>&1 || die "target container missing: $TARGET_CONTAINER"

TARGET_VOLUME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$TARGET_CONTAINER" 2>/dev/null || true)"
[[ -n "$TARGET_VOLUME" ]] || die "target postgres data volume missing on $TARGET_CONTAINER"
COMPOSE_PROJECT="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$TARGET_CONTAINER" 2>/dev/null || true)"
[[ -n "$COMPOSE_PROJECT" && "$COMPOSE_PROJECT" != "<no value>" ]] \
  || die "RESTORE_TARGET_COMPOSE_PROJECT_MISSING"
TARGET_NETWORKS=()
while IFS= read -r _wr_net; do
  [[ -n "$_wr_net" ]] && TARGET_NETWORKS+=("$_wr_net")
done < <(docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$TARGET_CONTAINER" 2>/dev/null || true)
[[ "${#TARGET_NETWORKS[@]}" -ge 1 ]] || die "RESTORE_TARGET_NETWORKS_EMPTY"
TARGET_NETWORK="${TARGET_NETWORKS[0]}"

wr_assert_public_production_restore_target "$TARGET_CONTAINER" "$TARGET_DB" "$TARGET_VOLUME" "$COMPOSE_PROJECT" "$TARGET_NETWORK" \
  || die "restore target refused"
wr_assert_public_production_restore_networks "${TARGET_NETWORKS[@]}" \
  || die "restore networks refused"

STAGING_PG="woodright-staging-postgres"
if docker inspect "$STAGING_PG" >/dev/null 2>&1; then
  staging_vol="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$STAGING_PG" 2>/dev/null || true)"
  [[ "$TARGET_VOLUME" != "$staging_vol" ]] || die "RESTORE_TARGET_SHARES_STAGING_VOLUME volume=$TARGET_VOLUME"
  staging_id="$(docker inspect --format '{{.Id}}' "$STAGING_PG")"
  target_id="$(docker inspect --format '{{.Id}}' "$TARGET_CONTAINER")"
  [[ "$staging_id" != "$target_id" ]] || die "RESTORE_TARGET_IS_STAGING_CONTAINER"
fi

log "copy dump into target container"
docker cp "$DUMP" "$TARGET_CONTAINER:/tmp/woodright-public-production-restore.dump"

log "terminate sessions + drop/recreate schema public on isolated production db"
docker exec -i "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
SQL

log "pg_restore into $TARGET_CONTAINER/$TARGET_DB"
docker exec "$TARGET_CONTAINER" pg_restore -U "$TARGET_USER" -d "$TARGET_DB" --no-owner --no-acl --exit-on-error \
  /tmp/woodright-public-production-restore.dump \
  || die "pg_restore failed"

docker exec "$TARGET_CONTAINER" rm -f /tmp/woodright-public-production-restore.dump

PRODUCTS="$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -tAc 'SELECT count(*) FROM product' | tr -d '[:space:]')"
VARIANTS="$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -tAc 'SELECT count(*) FROM product_variant' | tr -d '[:space:]')"
[[ "$PRODUCTS" =~ ^[0-9]+$ && "$PRODUCTS" -gt 0 ]] || die "restore produced empty product table"
[[ "$VARIANTS" =~ ^[0-9]+$ && "$VARIANTS" -gt 0 ]] || die "restore produced empty product_variant table"

mkdir -p "$REPORT_DIR"
chmod 700 "$REPORT_DIR" 2>/dev/null || true
TS="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$REPORT_DIR/restore-dump-${TS}.json"
python3 - "$REPORT" "$ACTUAL_SHA" "$TARGET_CONTAINER" "$TARGET_DB" "$TARGET_VOLUME" "$PRODUCTS" "$VARIANTS" <<'PY'
import json, sys, datetime
path, sha, ctr, db, vol, products, variants = sys.argv[1:8]
json.dump({
  "schema": "woodright.public_production.restore_dump.v1",
  "created_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "dump_sha256": sha,
  "target_container": ctr,
  "target_db": db,
  "target_volume": vol,
  "product_count": int(products),
  "product_variant_count": int(variants),
  "scrubbed": False,
  "staging_untouched": True,
}, open(path, "w"), indent=2)
print(path)
PY

log "PUBLIC_PRODUCTION_RESTORE_DUMP_OK products=$PRODUCTS variants=$VARIANTS volume=$TARGET_VOLUME"
