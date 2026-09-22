#!/usr/bin/env bash
# Apply exactly Migration20260908120000 through Medusa's Migrations.run wrapper.
# That wrapper calls MikroORM migrator.up({ migrations: [name] }) inside the
# framework transaction and writes mikro_orm_migrations. It does not call
# medusa db:migrate and does not load other modules' migration directories.
#
# LIVE_MUTATING=true only for --mode execute. Dry-run is the default.
# Rehearsal refuses the live production/staging Postgres containers.
# Live scope requires a separate confirmation and is not used by rehearsal.
set -Eeuo pipefail

ALLOWED_MIGRATION="Migration20260908120000"
EXPECTED_APP_SHA="931140158756b921100e4f97cf1f27cd3ba61bc2"
EXPECTED_MIGRATION_SHA256="e5e3ecdfa91af6680f848585c94e93599d9cd7d6f6671ff4b2bc90d0d2f0fdb1"
EXPECTED_DB="woodright_public_production"
EXECUTE_TOKEN="I_UNDERSTAND_TARGETED_MIGRATION_EXECUTE"
LIVE_TOKEN="I_UNDERSTAND_LIVE_PUBLIC_PRODUCTION_TARGETED_MIGRATION"
REHEARSAL_TOKEN="I_UNDERSTAND_REHEARSAL_TARGETED_MIGRATION"
MIGRATIONS_DIR="/server/src/modules/promotion-slot/migrations"
MARKER_DEFAULT="/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt"

ENVIRONMENT=""
MIGRATION=""
MODE="dry-run"
CONFIRM=""
RUNTIME_SCOPE=""
PG_CONTAINER=""
APPLICATION_SHA=""
GOVERNANCE_SHA=""
BACKUP_MANIFEST=""
BACKEND_IMAGE=""
DATABASE_URL="${DATABASE_URL:-}"
MARKER_PATH="${WOODRIGHT_GOVERNANCE_MARKER:-$MARKER_DEFAULT}"
RUNNER="${WOODRIGHT_TARGETED_MIGRATION_RUNNER:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/woodright-targeted-migration.cjs}"

log() { printf '%s woodright-targeted-migration %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --migration) MIGRATION="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --confirm) CONFIRM="$2"; shift 2 ;;
    --runtime-scope) RUNTIME_SCOPE="$2"; shift 2 ;;
    --postgres-container) PG_CONTAINER="$2"; shift 2 ;;
    --application-sha) APPLICATION_SHA="$2"; shift 2 ;;
    --governance-sha) GOVERNANCE_SHA="$2"; shift 2 ;;
    --backup-manifest) BACKUP_MANIFEST="$2"; shift 2 ;;
    --backend-image) BACKEND_IMAGE="$2"; shift 2 ;;
    *) die "unknown arg $1" ;;
  esac
done

[[ "$ENVIRONMENT" == "public_production" ]] || die "environment must be public_production"
[[ "$MIGRATION" == "$ALLOWED_MIGRATION" ]] || die "migration refused: ${MIGRATION:-empty}"
[[ "$MODE" == "dry-run" || "$MODE" == "execute" ]] || die "mode must be dry-run or execute"
[[ "$RUNTIME_SCOPE" == "rehearsal" || "$RUNTIME_SCOPE" == "live" ]] || die "runtime-scope must be rehearsal or live"
[[ "$APPLICATION_SHA" == "$EXPECTED_APP_SHA" ]] || die "application SHA refused"
[[ "$GOVERNANCE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "governance SHA must be 40 hex"
[[ -n "$PG_CONTAINER" ]] || die "postgres container required"
[[ -n "$BACKEND_IMAGE" ]] || die "backend image required"
[[ -f "$BACKUP_MANIFEST" ]] || die "backup manifest missing"
[[ -f "$MARKER_PATH" ]] || die "governance marker missing"
[[ -f "$RUNNER" ]] || die "runner missing"

case "$PG_CONTAINER" in
  *staging*|*demo*|*candidate*) die "refusing container name $PG_CONTAINER" ;;
esac
if [[ "$RUNTIME_SCOPE" == "rehearsal" ]]; then
  case "$PG_CONTAINER" in
    woodright-public-production-postgres|medusa_postgres) die "rehearsal refuses live postgres container" ;;
    woodright-rehearsal-promotion-slot) ;;
    *) die "rehearsal container must be woodright-rehearsal-promotion-slot" ;;
  esac
  [[ "$CONFIRM" == "$REHEARSAL_TOKEN" || "$MODE" == "dry-run" ]] || die "rehearsal execute requires rehearsal confirmation"
else
  [[ "$PG_CONTAINER" == "woodright-public-production-postgres" ]] || die "live scope requires the public production postgres container"
  [[ "$MODE" == "dry-run" || "$CONFIRM" == "$LIVE_TOKEN" ]] || die "live execute requires the live confirmation token"
fi
if [[ "$MODE" == "execute" && "$CONFIRM" != "$EXECUTE_TOKEN" && "$CONFIRM" != "$REHEARSAL_TOKEN" && "$CONFIRM" != "$LIVE_TOKEN" ]]; then
  die "execute requires confirmation"
fi
if [[ "$MODE" == "execute" && "$RUNTIME_SCOPE" == "rehearsal" && "$CONFIRM" != "$REHEARSAL_TOKEN" ]]; then
  die "rehearsal execute confirmation mismatch"
fi
if [[ "$MODE" == "execute" && "$RUNTIME_SCOPE" == "live" && "$CONFIRM" != "$LIVE_TOKEN" ]]; then
  die "live execute confirmation mismatch"
fi

marker="$(tr -d '[:space:]' <"$MARKER_PATH")"
[[ "$marker" == "$GOVERNANCE_SHA" ]] || die "governance marker does not match --governance-sha"

python3 - "$BACKUP_MANIFEST" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1]))
if doc.get("environment") != "public_production":
    raise SystemExit("backup environment mismatch")
db = doc.get("db") or {}
sha = db.get("sha256") or ""
if len(sha) != 64:
    raise SystemExit("backup db checksum missing")
if db.get("name") not in ("", "woodright_public_production"):
    raise SystemExit("backup db name mismatch")
PY

query() {
  local sql="$1"
  if [[ "${WOODRIGHT_TARGETED_MIGRATION_TEST:-}" == "1" ]]; then
    python3 - "$WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR" "$sql" <<'PY'
import pathlib, sys
root, sql = pathlib.Path(sys.argv[1]), sys.argv[2]
if "current_database" in sql:
    print((root / "database").read_text().strip())
elif "to_regclass" in sql:
    print((root / "regclass").read_text().strip())
elif "from mikro_orm_migrations" in sql:
    text = (root / "applied").read_text()
    name = sql.split("'")[1]
    print("1" if name in text.splitlines() else "")
elif "pg_get_constraintdef" in sql:
    print((root / "pk").read_text().strip())
else:
    raise SystemExit("unhandled test query")
PY
    return
  fi
  docker exec "$PG_CONTAINER" psql -U "${WOODRIGHT_PG_USER:-woodright}" -d "$EXPECTED_DB" -Atc "$sql"
}

db_name="$(query "select current_database();")"
[[ "$db_name" == "$EXPECTED_DB" ]] || die "database identity refused: ${db_name:-empty}"

regclass="$(query "select coalesce(to_regclass('public.promotion_slot')::text, '');")"
applied="$(query "select name from mikro_orm_migrations where name = '$ALLOWED_MIGRATION';")"
if [[ -n "$applied" ]]; then
  die "ALREADY_APPLIED $ALLOWED_MIGRATION"
fi
if [[ -n "$regclass" ]]; then
  die "partial promotion_slot exists without migration bookkeeping"
fi

if [[ "${WOODRIGHT_TARGETED_MIGRATION_TEST:-}" == "1" ]]; then
  image_sha="$(tr -d '[:space:]' <"$WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR/app-sha")"
  file_sha="$(tr -d '[:space:]' <"$WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR/migration-sha")"
else
  image_sha="$(docker inspect "$BACKEND_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  file_sha="$(docker run --rm --entrypoint sha256sum "$BACKEND_IMAGE" "$MIGRATIONS_DIR/${ALLOWED_MIGRATION}.js" | awk '{print $1}')"
fi
[[ "$image_sha" == "$EXPECTED_APP_SHA" ]] || die "backend image revision mismatch"
[[ "$file_sha" == "$EXPECTED_MIGRATION_SHA256" ]] || die "migration source hash mismatch"

log "preflight ok scope=$RUNTIME_SCOPE migration=$ALLOWED_MIGRATION db=$db_name mode=$MODE"
if [[ "$MODE" == "dry-run" ]]; then
  log "dry-run: no migration executed"
  printf '%s\n' "DRY_RUN_OK migration=$ALLOWED_MIGRATION"
  exit 0
fi

if [[ "${WOODRIGHT_TARGETED_MIGRATION_TEST:-}" != "1" ]]; then
  pg_user="$(docker exec "$PG_CONTAINER" printenv POSTGRES_USER)"
  pg_pass="$(docker exec "$PG_CONTAINER" printenv POSTGRES_PASSWORD)"
  [[ -n "$pg_user" && -n "$pg_pass" ]] || die "postgres credentials missing on $PG_CONTAINER"
  enc_pass="$(PG_PASS="$pg_pass" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["PG_PASS"], safe=""))')"
  # --network container:<postgres> makes 127.0.0.1 this database, not another host.
  DATABASE_URL="postgres://${pg_user}:${enc_pass}@127.0.0.1:5432/${EXPECTED_DB}"
fi
if [[ "${WOODRIGHT_TARGETED_MIGRATION_TEST:-}" == "1" ]]; then
  plan="$(node "$RUNNER" --migration "$ALLOWED_MIGRATION")"
else
  plan="$(docker run --rm --entrypoint node -v "$RUNNER:/tmp/woodright-targeted-migration.cjs:ro" "$BACKEND_IMAGE" /tmp/woodright-targeted-migration.cjs --migration "$ALLOWED_MIGRATION")"
fi
[[ "$plan" == *'"migrations":["'"$ALLOWED_MIGRATION"'"]'* ]] || die "runner plan did not select only $ALLOWED_MIGRATION"
if [[ "$plan" == *"Migration20250505101505"* ]]; then
  die "runner plan included the workflow primary-key migration"
fi

if [[ "${WOODRIGHT_TARGETED_MIGRATION_TEST:-}" == "1" ]]; then
  printf '%s\n' "$plan" >"$WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR/plan.json"
  printf '%s\n' "$ALLOWED_MIGRATION" >"$WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR/executed"
  log "test execute recorded plan without a database"
  printf '%s\n' "EXECUTE_RECORDED migration=$ALLOWED_MIGRATION"
  exit 0
fi

docker run --rm \
  --network "container:${PG_CONTAINER}" \
  --entrypoint node \
  -e DATABASE_URL \
  -e WOODRIGHT_TARGETED_MIGRATION_FRAMEWORK=1 \
  -v "$RUNNER:/tmp/woodright-targeted-migration.cjs:ro" \
  "$BACKEND_IMAGE" \
  /tmp/woodright-targeted-migration.cjs \
  --migration "$ALLOWED_MIGRATION" \
  --migrations-dir "$MIGRATIONS_DIR"

applied_after="$(query "select name from mikro_orm_migrations where name = '$ALLOWED_MIGRATION';")"
[[ "$applied_after" == "$ALLOWED_MIGRATION" ]] || die "bookkeeping missing after execute"
regclass_after="$(query "select coalesce(to_regclass('public.promotion_slot')::text, '');")"
[[ "$regclass_after" == "promotion_slot" ]] || die "promotion_slot missing after execute"
workflow_still="$(query "select name from mikro_orm_migrations where name = 'Migration20250505101505';")"
[[ -z "$workflow_still" ]] || die "workflow migration was applied"
log "execute ok migration=$ALLOWED_MIGRATION"
printf '%s\n' "EXECUTE_OK migration=$ALLOWED_MIGRATION"
