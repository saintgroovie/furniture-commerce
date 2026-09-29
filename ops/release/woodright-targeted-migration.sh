#!/usr/bin/env bash
# Apply exactly Migration20260908120000 through Medusa's Migrations.run wrapper.
# That wrapper calls MikroORM migrator.up({ migrations: [name] }) inside the
# framework transaction and writes mikro_orm_migrations. It does not call
# the unfiltered module migrator and does not load other migration directories.
#
# LIVE_MUTATING=true
# requires_global_lock=true
# flock: public_production live-cutover.lock via wr_staging_mutation_lock_acquire
# Canonical lock: /srv/woodright/locks/public_production/live-cutover.lock
#
# Dry-run does not take the lock and does not open a migration connection.
# Execute takes the public_production lock before the framework call.
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
LOCK_PATH="/srv/woodright/locks/public_production/live-cutover.lock"
MARKER_DEFAULT="/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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
DATABASE_URL=""
MARKER_PATH="${WOODRIGHT_GOVERNANCE_MARKER:-$MARKER_DEFAULT}"
RUNNER="$ROOT/ops/release/woodright-targeted-migration.cjs"
LOCK_HELPER="$ROOT/ops/lib/woodright-staging-mutation-lock.sh"
PG_EXEC=""
IMAGE_REF=""
MAX_BACKUP_AGE_HOURS=72

log() { printf '%s woodright-targeted-migration %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

MIGRATION_NAME=""
stop_migration_container() {
  if [[ -n "${MIGRATION_NAME:-}" ]]; then
    docker kill "$MIGRATION_NAME" >/dev/null 2>&1 || true
    docker wait "$MIGRATION_NAME" >/dev/null 2>&1 || true
    docker rm -f "$MIGRATION_NAME" >/dev/null 2>&1 || true
  fi
  unset DATABASE_URL || true
}
on_migration_exit() {
  local rc=$?
  stop_migration_container
  wr_staging_mutation_lock_release || true
  return "$rc"
}
on_migration_int() {
  stop_migration_container
  wr_staging_mutation_lock_release || true
  trap - INT
  kill -INT $$
}
on_migration_term() {
  stop_migration_container
  wr_staging_mutation_lock_release || true
  trap - TERM
  kill -TERM $$
}

require_value() {
  [[ $# -ge 2 && -n "${2:-}" ]] || die "missing value for $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) require_value "$@"; ENVIRONMENT="$2"; shift 2 ;;
    --migration) require_value "$@"; MIGRATION="$2"; shift 2 ;;
    --mode) require_value "$@"; MODE="$2"; shift 2 ;;
    --confirm) require_value "$@"; CONFIRM="$2"; shift 2 ;;
    --runtime-scope) require_value "$@"; RUNTIME_SCOPE="$2"; shift 2 ;;
    --postgres-container) require_value "$@"; PG_CONTAINER="$2"; shift 2 ;;
    --application-sha) require_value "$@"; APPLICATION_SHA="$2"; shift 2 ;;
    --governance-sha) require_value "$@"; GOVERNANCE_SHA="$2"; shift 2 ;;
    --backup-manifest) require_value "$@"; BACKUP_MANIFEST="$2"; shift 2 ;;
    --backend-image) require_value "$@"; BACKEND_IMAGE="$2"; shift 2 ;;
    *) die "unknown arg $1" ;;
  esac
done

[[ "$ENVIRONMENT" == "public_production" ]] || die "environment must be public_production"
[[ "$MIGRATION" == "$ALLOWED_MIGRATION" ]] || die "migration refused: ${MIGRATION:-empty}"
[[ "$MODE" == "dry-run" || "$MODE" == "execute" ]] || die "mode must be dry-run or execute"
[[ "$RUNTIME_SCOPE" == "rehearsal" || "$RUNTIME_SCOPE" == "live" ]] || die "runtime-scope must be rehearsal or live"
[[ "$APPLICATION_SHA" == "$EXPECTED_APP_SHA" ]] || die "application SHA refused"
[[ "$GOVERNANCE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "governance SHA must be 40 hex"
[[ "$PG_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$ ]] || die "container name refused"
[[ -n "$BACKEND_IMAGE" ]] || die "backend image required"
[[ -f "$BACKUP_MANIFEST" ]] || die "backup manifest missing"
[[ -f "$MARKER_PATH" ]] || die "governance marker missing"
[[ -f "$RUNNER" ]] || die "runner missing"
[[ "$MIGRATIONS_DIR" == "/server/src/modules/promotion-slot/migrations" ]] || die "migrations directory drifted"

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

WOODRIGHT_TARGETED_MIGRATION_TEST="${WOODRIGHT_TARGETED_MIGRATION_TEST:-0}" \
  python3 - "$BACKUP_MANIFEST" <<'PY'
import hashlib, json, os, sys
doc = json.load(open(sys.argv[1]))
if doc.get("environment") != "public_production":
    raise SystemExit("backup environment mismatch")
if doc.get("schema") != "woodright_recovery_point_v2":
    raise SystemExit("backup schema mismatch")
if doc.get("kind") != "woodright_recovery_point":
    raise SystemExit("backup kind refused")
if doc.get("status") != "success":
    raise SystemExit("backup status refused")
if doc.get("partial") is not False:
    raise SystemExit("backup partial refused")
if doc.get("verification_status") not in ("verified", "pending_rehearsal", "unverified"):
    raise SystemExit("backup verification refused")
created = doc.get("created_at_utc") or ""
import datetime
try:
    created_at = datetime.datetime.strptime(created, "%Y%m%dT%H%M%SZ").replace(tzinfo=datetime.timezone.utc)
except ValueError:
    raise SystemExit("backup created_at missing")
age = datetime.datetime.now(datetime.timezone.utc) - created_at
if age.total_seconds() < 0 or age > datetime.timedelta(hours=72):
    raise SystemExit("backup freshness refused")
app = doc.get("application_sha") or ""
if len(app) != 40 or any(ch not in "0123456789abcdef" for ch in app):
    raise SystemExit("backup application SHA missing")
db = doc.get("db") or {}
if db.get("name") != "woodright_public_production":
    raise SystemExit("backup db name mismatch")
sha = db.get("sha256") or ""
if len(sha) != 64 or any(ch not in "0123456789abcdef" for ch in sha):
    raise SystemExit("backup db checksum missing")
if os.environ.get("WOODRIGHT_TARGETED_MIGRATION_TEST") == "1":
    raise SystemExit(0)
path = db.get("path") or ""
if not path or os.path.islink(path) or not os.path.isfile(path):
    raise SystemExit("backup dump missing")
digest = hashlib.sha256()
with open(path, "rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        digest.update(chunk)
if digest.hexdigest() != sha:
    raise SystemExit("backup checksum mismatch")
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
  docker exec "$PG_EXEC" psql -U "${WOODRIGHT_PG_USER:-woodright}" -d "$EXPECTED_DB" -Atc "$sql"
}

assert_database_gate() {
  local db_name regclass applied image_sha file_sha
  db_name="$(query "select current_database();")"
  [[ "$db_name" == "$EXPECTED_DB" ]] || die "database identity refused: ${db_name:-empty}"
  regclass="$(query "select coalesce(to_regclass('public.promotion_slot')::text, '');")"
  applied="$(query "select name from mikro_orm_migrations where name = '${ALLOWED_MIGRATION}';")"
  if [[ -n "$applied" && -z "$regclass" ]]; then
    die "BOOKKEEPING_WITHOUT_TABLE $ALLOWED_MIGRATION"
  fi
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
    image_sha="$(docker inspect "$IMAGE_REF" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    file_sha="$(docker run --rm --entrypoint sha256sum "$IMAGE_REF" "$MIGRATIONS_DIR/${ALLOWED_MIGRATION}.js" | awk '{print $1}')"
  fi
  [[ "$image_sha" == "$EXPECTED_APP_SHA" ]] || die "backend image revision mismatch"
  [[ "$file_sha" == "$EXPECTED_MIGRATION_SHA256" ]] || die "migration source hash mismatch"
}

PG_EXEC="$PG_CONTAINER"
IMAGE_REF="$BACKEND_IMAGE"
if [[ "$MODE" == "dry-run" ]]; then
  assert_database_gate
  log "preflight ok scope=$RUNTIME_SCOPE migration=$ALLOWED_MIGRATION db=$EXPECTED_DB mode=$MODE"
  log "dry-run: no migration executed"
  printf '%s\n' "DRY_RUN_OK migration=$ALLOWED_MIGRATION"
  exit 0
fi

if [[ "${WOODRIGHT_TARGETED_MIGRATION_TEST:-}" != "1" ]]; then
  unset WOODRIGHT_STAGING_MUTATION_LOCK_HELD
  unset _WR_STAGING_LOCK_OWNED
  export WR_STAGING_MUTATION_LOCK_PATH="$LOCK_PATH"
  # shellcheck source=../lib/woodright-staging-mutation-lock.sh
  source "$LOCK_HELPER"
  wr_staging_mutation_lock_acquire \
    "actor=woodright-targeted-migration" \
    "command=$0" \
    "target=$PG_CONTAINER" \
    || die "public_production live-cutover.lock busy/unavailable"
  [[ "$WR_STAGING_MUTATION_LOCK_PATH" == "$LOCK_PATH" ]] || die "lock path is not public_production"
  lock_fd="$(readlink -f /proc/self/fd/9)"
  [[ "$lock_fd" == "$LOCK_PATH" ]] || die "lock fd is not the public_production lock"
  PG_ID="$(docker inspect "$PG_CONTAINER" --format '{{.Id}}')"
  IMAGE_ID="$(docker inspect "$BACKEND_IMAGE" --format '{{.Id}}')"
  [[ -n "$PG_ID" && -n "$IMAGE_ID" ]] || die "container or image id missing"
  [[ "$(docker inspect "$PG_ID" --format '{{.Id}}')" == "$PG_ID" ]] || die "postgres id changed under lock"
  [[ "$(docker inspect "$IMAGE_ID" --format '{{.Id}}')" == "$IMAGE_ID" ]] || die "backend image id changed under lock"
  PG_EXEC="$PG_ID"
  IMAGE_REF="$IMAGE_ID"
fi

assert_database_gate
log "preflight ok scope=$RUNTIME_SCOPE migration=$ALLOWED_MIGRATION db=$EXPECTED_DB mode=$MODE"

if [[ "${WOODRIGHT_TARGETED_MIGRATION_TEST:-}" == "1" ]]; then
  plan="$(node "$RUNNER" --migration "$ALLOWED_MIGRATION")"
else
  plan="$(docker run --rm --entrypoint node -v "$RUNNER:/tmp/woodright-targeted-migration.cjs:ro" "$IMAGE_REF" /tmp/woodright-targeted-migration.cjs --migration "$ALLOWED_MIGRATION")"
fi
[[ "$plan" == *'"migrations":["'"$ALLOWED_MIGRATION"'"]'* ]] || die "runner plan did not select only $ALLOWED_MIGRATION"
[[ "$plan" == *'/server/src/modules/promotion-slot/migrations'* ]] || die "runner plan left the promotion-slot directory"
if [[ "$plan" == *"Migration20250505101505"* || "$plan" == *"workflow-engine-redis"* || "$plan" == *"/translation/"* || "$plan" == *"/rbac/"* || "$plan" == *"/index/"* ]]; then
  die "runner plan included a migration outside promotion-slot"
fi

if [[ "${WOODRIGHT_TARGETED_MIGRATION_TEST:-}" == "1" ]]; then
  printf '%s\n' "$plan" >"$WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR/plan.json"
  printf '%s\n' "$ALLOWED_MIGRATION" >"$WOODRIGHT_TARGETED_MIGRATION_FIXTURE_DIR/executed"
  log "test execute recorded plan without a database"
  printf '%s\n' "EXECUTE_RECORDED migration=$ALLOWED_MIGRATION"
  exit 0
fi

pg_user="$(docker exec "$PG_EXEC" printenv POSTGRES_USER)"
pg_pass="$(docker exec "$PG_EXEC" printenv POSTGRES_PASSWORD)"
[[ -n "$pg_user" && -n "$pg_pass" ]] || die "postgres credentials missing on pinned container"
enc_pass="$(PG_PASS="$pg_pass" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["PG_PASS"], safe=""))')"
DATABASE_URL="postgres://${pg_user}:${enc_pass}@127.0.0.1:5432/${EXPECTED_DB}"
export DATABASE_URL
unset enc_pass pg_pass
MIGRATION_NAME="woodright-targeted-migration-$$"
trap 'on_migration_exit' EXIT
trap 'on_migration_int' INT
trap 'on_migration_term' TERM

docker run -d --name "$MIGRATION_NAME" \
  --network "container:${PG_EXEC}" \
  --entrypoint node \
  -e DATABASE_URL \
  -e WOODRIGHT_TARGETED_MIGRATION_FRAMEWORK=1 \
  -v "$RUNNER:/tmp/woodright-targeted-migration.cjs:ro" \
  "$IMAGE_REF" \
  /tmp/woodright-targeted-migration.cjs \
  --migration "$ALLOWED_MIGRATION" \
  --migrations-dir "$MIGRATIONS_DIR" >/dev/null
set +e
framework_rc="$(docker wait "$MIGRATION_NAME")"
set -e
framework_logs="$(docker logs "$MIGRATION_NAME" 2>&1 || true)"
stop_migration_container
MIGRATION_NAME=""
printf '%s\n' "$framework_logs" | python3 -c 'import sys,re; sys.stdout.write(re.sub(r"postgres(?:ql)?://[^@\s]+@", "postgres://redacted@", sys.stdin.read()))'
unset framework_logs DATABASE_URL
[[ "$framework_rc" == "0" ]] || die "framework container failed"

applied_after="$(query "select name from mikro_orm_migrations where name = '${ALLOWED_MIGRATION}';")"
[[ -n "$applied_after" ]] || die "bookkeeping missing after execute"
regclass_after="$(query "select coalesce(to_regclass('public.promotion_slot')::text, '');")"
[[ "$regclass_after" == "promotion_slot" ]] || die "promotion_slot missing after execute"
workflow_still="$(query "select name from mikro_orm_migrations where name = 'Migration20250505101505';")"
[[ -z "$workflow_still" ]] || die "workflow migration was applied"
log "execute ok migration=$ALLOWED_MIGRATION"
printf '%s\n' "EXECUTE_OK migration=$ALLOWED_MIGRATION"
