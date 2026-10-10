#!/usr/bin/env bash
# Apply exactly Migration20261005120000 through Medusa's Migrations.run wrapper.
# The wrapper calls MikroORM migrator.up({ migrations: [name] }) and writes one
# mikro_orm_migrations row. The only loaded directory is the product-compatibility
# module. This script does not call the unfiltered module migrator.
#
# Live backend must still be 01d8fd57 while this additive table is created.
# The storefront already advanced to the contacts commit 9e44d440; that revision
# is pinned separately. The migration file is executed from the candidate image
# 5aa0c2c / d087, which is not the live backend.
#
# LIVE_MUTATING=true
# requires_global_lock=true
# flock: public_production live-cutover.lock via wr_staging_mutation_lock_acquire
# Canonical lock: /srv/woodright/locks/public_production/live-cutover.lock
#
# Dry-run does not take the lock and does not open a migration connection.
# Execute takes the public_production lock before the framework call.
# Rehearsal refuses the live production Postgres container and requires the
# disposable database name.
set -Eeuo pipefail

ALLOWED_MIGRATION="Migration20261005120000"
EXPECTED_LIVE_BACKEND_SHA="01d8fd57c4b33868be116f09a7a2814f437c43c4"
EXPECTED_LIVE_BACKEND_REPO_DIGEST="sha256:8c23319c07dd83d7078aae13df5912322df4de0a39ee45b4d561e3b6156152d6"
EXPECTED_LIVE_BACKEND_IMAGE_ID="sha256:b9451cd0e1bf9c212781d628c86425c2598e4e8e01bb1ab3a30e368693e1b517"
EXPECTED_LIVE_STOREFRONT_SHA="9e44d44015d1a3f1bcd259fca4b8ef09d5b6d4d5"
EXPECTED_LIVE_STOREFRONT_REPO_DIGEST="sha256:e4288d7bff8a119ad31051b5cfa4dd7f2f5de0874e2668ad84ddc84f77862b93"
EXPECTED_LIVE_STOREFRONT_IMAGE_ID="sha256:a448fda12beefa50b0b4484b9d1257690e72e59a854d1579568c7e515b5b14b7"
EXPECTED_MIGRATION_IMAGE_SHA="5aa0c2c7818a42f56d52311c5149222c18d82427"
EXPECTED_MIGRATION_IMAGE_DIGEST="sha256:d087b0541ccf846fa7ef1d23108e1f488b20ff47c334a9614746d5047b5c62f3"
EXPECTED_MIGRATION_SHA256="51ef408272c219feddd628497c92bbe1fe75476844f9ea67dd8f01664d901082"
LIVE_DB="woodright_public_production"
REHEARSAL_DB="woodright_rehearsal_product_compatibility"
REHEARSAL_TOKEN="I_UNDERSTAND_REHEARSAL_PRODUCT_COMPATIBILITY_MIGRATION"
LIVE_TOKEN="I_UNDERSTAND_LIVE_PUBLIC_PRODUCTION_PRODUCT_COMPATIBILITY_MIGRATION"
MIGRATIONS_DIR="/server/src/modules/product-compatibility/migrations"
LOCK_PATH="/srv/woodright/locks/public_production/live-cutover.lock"
MARKER_DEFAULT="/srv/woodright/tools/release/INSTALLED_ENV_GOVERNANCE_SHA.txt"
LIVE_BACKEND_CONTAINER="woodright-public-production-backend"
LIVE_STOREFRONT_CONTAINER="woodright-public-production-storefront"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ENVIRONMENT=""
MIGRATION=""
MODE="dry-run"
CONFIRM=""
RUNTIME_SCOPE=""
PG_CONTAINER=""
LIVE_APPLICATION_SHA=""
GOVERNANCE_SHA=""
BACKUP_MANIFEST=""
BACKEND_IMAGE=""
DATABASE_URL=""
MARKER_PATH="${WOODRIGHT_GOVERNANCE_MARKER:-$MARKER_DEFAULT}"
RUNNER="$ROOT/ops/release/woodright-product-compatibility-migration.cjs"
LOCK_HELPER="$ROOT/ops/lib/woodright-staging-mutation-lock.sh"
PG_EXEC=""
IMAGE_REF=""
EXPECTED_DB=""

log() { printf '%s woodright-product-compatibility-migration %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

MIGRATION_NAME=""
# BEGIN MIGRATION_CONTAINER_GUARD
migration_container_confirmed_stopped() {
  [[ -z "${MIGRATION_NAME:-}" ]] && return 0
  local state inspect_err
  if ! inspect_err="$(docker inspect -f '{{.State.Status}}' "$MIGRATION_NAME" 2>&1)"; then
    if [[ "$inspect_err" == *"No such container"* || "$inspect_err" == *"No such object"* ]]; then
      return 0
    fi
    return 1
  fi
  state="$inspect_err"
  if [[ "$state" != "exited" && "$state" != "dead" ]]; then
    return 1
  fi
  local rm_err
  if ! rm_err="$(docker rm -f "$MIGRATION_NAME" 2>&1)"; then
    if [[ "$rm_err" != *"No such container"* && "$rm_err" != *"No such object"* ]]; then
      return 1
    fi
  fi
  if ! inspect_err="$(docker inspect "$MIGRATION_NAME" 2>&1)"; then
    if [[ "$inspect_err" == *"No such container"* || "$inspect_err" == *"No such object"* ]]; then
      return 0
    fi
  fi
  return 1
}
stop_migration_container() {
  [[ -z "${MIGRATION_NAME:-}" ]] && return 0
  docker kill "$MIGRATION_NAME" >/dev/null 2>&1 || true
  if migration_container_confirmed_stopped; then
    MIGRATION_NAME=""
    unset DATABASE_URL || true
    return 0
  fi
  return 1
}
wait_until_migration_stopped() {
  while ! stop_migration_container; do
    log "holding public_production lock until the migration container is confirmed stopped"
    sleep "${WOODRIGHT_MIGRATION_STOP_WAIT_SEC:-2}"
  done
}
on_migration_exit() {
  local rc=$?
  wait_until_migration_stopped
  wr_staging_mutation_lock_release || true
  return "$rc"
}
on_migration_int() {
  wait_until_migration_stopped
  wr_staging_mutation_lock_release || true
  trap - INT
  kill -INT $$
}
on_migration_term() {
  wait_until_migration_stopped
  wr_staging_mutation_lock_release || true
  trap - TERM
  kill -TERM $$
}
# END MIGRATION_CONTAINER_GUARD

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
    --live-application-sha) require_value "$@"; LIVE_APPLICATION_SHA="$2"; shift 2 ;;
    --governance-sha) require_value "$@"; GOVERNANCE_SHA="$2"; shift 2 ;;
    --backup-manifest) require_value "$@"; BACKUP_MANIFEST="$2"; shift 2 ;;
    --backend-image) require_value "$@"; BACKEND_IMAGE="$2"; shift 2 ;;
    *) die "unknown arg $1" ;;
  esac
done

[[ "$ENVIRONMENT" == "public_production" ]] || die "environment must be public_production"
[[ "$MIGRATION" == "$ALLOWED_MIGRATION" ]] || die "REFUSED_TARGETED_MIGRATION_NOT_ALLOWED"
[[ "$MODE" == "dry-run" || "$MODE" == "execute" ]] || die "mode must be dry-run or execute"
[[ "$RUNTIME_SCOPE" == "rehearsal" || "$RUNTIME_SCOPE" == "live" ]] || die "runtime-scope must be rehearsal or live"
[[ "$LIVE_APPLICATION_SHA" == "$EXPECTED_LIVE_BACKEND_SHA" ]] || die "LIVE_APPLICATION_SHA_REFUSED"
[[ "$GOVERNANCE_SHA" =~ ^[0-9a-f]{40}$ ]] || die "governance SHA must be 40 hex"
[[ "$PG_CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$ ]] || die "container name refused"
[[ -n "$BACKEND_IMAGE" ]] || die "backend image required"
[[ -f "$BACKUP_MANIFEST" ]] || die "backup manifest missing"
[[ -f "$MARKER_PATH" ]] || die "governance marker missing"
[[ -f "$RUNNER" ]] || die "runner missing"
[[ -f "$LOCK_HELPER" ]] || die "lock helper missing"
[[ "$MIGRATIONS_DIR" == "/server/src/modules/product-compatibility/migrations" ]] || die "migrations directory drifted"

case "$ENVIRONMENT" in
  local|demo|staging|public_demo|production_candidate) die "environment must be public_production" ;;
esac
case "$PG_CONTAINER" in
  *staging*|*demo*|*candidate*|*local*) die "refusing container name $PG_CONTAINER" ;;
esac

if [[ "$RUNTIME_SCOPE" == "rehearsal" ]]; then
  EXPECTED_DB="$REHEARSAL_DB"
  case "$PG_CONTAINER" in
    woodright-public-production-postgres|medusa_postgres) die "rehearsal refuses live postgres container" ;;
    woodright-rehearsal-product-compatibility) ;;
    *) die "rehearsal container must be woodright-rehearsal-product-compatibility" ;;
  esac
  [[ "$MODE" == "dry-run" || "$CONFIRM" == "$REHEARSAL_TOKEN" ]] || die "rehearsal execute requires rehearsal confirmation"
else
  EXPECTED_DB="$LIVE_DB"
  [[ "$PG_CONTAINER" == "woodright-public-production-postgres" ]] || die "live scope requires the public production postgres container"
  [[ "$MODE" == "dry-run" || "$CONFIRM" == "$LIVE_TOKEN" ]] || die "live execute requires the live confirmation token"
fi

marker="$(tr -d '[:space:]' <"$MARKER_PATH")"
[[ "$marker" == "$GOVERNANCE_SHA" ]] || die "governance marker does not match --governance-sha"

WR_EXPECT_BACKUP_APP_SHA="$EXPECTED_LIVE_STOREFRONT_SHA" \
WR_EXPECT_BACKUP_BACKEND_IMAGE_ID="$EXPECTED_LIVE_BACKEND_IMAGE_ID" \
WR_EXPECT_BACKUP_STOREFRONT_IMAGE_ID="$EXPECTED_LIVE_STOREFRONT_IMAGE_ID" \
WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST="${WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST:-0}" \
  python3 - "$BACKUP_MANIFEST" <<'PY'
import datetime, hashlib, json, os, sys
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
try:
    created_at = datetime.datetime.strptime(created, "%Y%m%dT%H%M%SZ").replace(tzinfo=datetime.timezone.utc)
except ValueError:
    raise SystemExit("backup created_at missing")
age = datetime.datetime.now(datetime.timezone.utc) - created_at
if age.total_seconds() < 0 or age > datetime.timedelta(hours=72):
    raise SystemExit("backup freshness refused")
if doc.get("application_sha") != os.environ["WR_EXPECT_BACKUP_APP_SHA"]:
    raise SystemExit("backup application SHA mismatch")
if doc.get("backend_digest") != os.environ["WR_EXPECT_BACKUP_BACKEND_IMAGE_ID"]:
    raise SystemExit("backup backend image mismatch")
if doc.get("storefront_digest") != os.environ["WR_EXPECT_BACKUP_STOREFRONT_IMAGE_ID"]:
    raise SystemExit("backup storefront image mismatch")
db = doc.get("db") or {}
if db.get("name") != "woodright_public_production":
    raise SystemExit("backup db name mismatch")
try:
    size = int(db.get("size_bytes"))
except (TypeError, ValueError):
    raise SystemExit("backup db size refused")
if size <= 0:
    raise SystemExit("backup db size refused")
sha = db.get("sha256") or ""
if len(sha) != 64 or any(ch not in "0123456789abcdef" for ch in sha):
    raise SystemExit("backup db checksum missing")
if os.environ.get("WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST") == "1":
    raise SystemExit(0)
path = db.get("path") or ""
if not path or os.path.islink(path) or not os.path.isfile(path):
    raise SystemExit("backup dump missing")
if os.path.getsize(path) <= 0:
    raise SystemExit("backup db size refused")
digest = hashlib.sha256()
with open(path, "rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        digest.update(chunk)
if digest.hexdigest() != sha:
    raise SystemExit("backup checksum mismatch")
PY

query() {
  local sql="$1"
  if [[ "${WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST:-}" == "1" ]]; then
    python3 - "$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR" "$sql" <<'PY'
import pathlib, sys
root, sql = pathlib.Path(sys.argv[1]), sys.argv[2]
applied = (root / "applied").read_text().splitlines()
if "current_database" in sql:
    print((root / "database").read_text().strip())
elif "to_regclass" in sql:
    print((root / "regclass").read_text().strip())
elif "Migration20250505101505" in sql:
    print((root / "dangerous-count").read_text().strip())
elif "count(*)" in sql and "Migration20261005120000" in sql:
    print("1" if "Migration20261005120000" in applied else "0")
elif "count(*)" in sql and "mikro_orm_migrations" in sql:
    print((root / "migration-count").read_text().strip())
elif "from mikro_orm_migrations" in sql:
    name = sql.split("'")[1]
    print(name if name in applied else "")
else:
    raise SystemExit("unhandled test query")
PY
    return
  fi
  docker exec "$PG_EXEC" psql -U "${WOODRIGHT_PG_USER:-woodright}" -d "$EXPECTED_DB" -Atc "$sql"
}

assert_lock_ready() {
  if [[ "${WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST:-}" == "1" ]]; then
    [[ "$(tr -d '[:space:]' <"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/lock-ready")" == "ready" ]] \
      || die "LOCK_NOT_READY"
    return
  fi
  [[ -f "$LOCK_PATH" && ! -L "$LOCK_PATH" ]] || die "LOCK_NOT_READY"
  [[ "$LOCK_PATH" == "/srv/woodright/locks/public_production/live-cutover.lock" ]] || die "LOCK_NOT_READY"
}

assert_live_application() {
  local be_rev sf_rev be_digest sf_digest be_image sf_image
  if [[ "${WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST:-}" == "1" ]]; then
    be_rev="$(tr -d '[:space:]' <"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/live-backend-revision")"
    sf_rev="$(tr -d '[:space:]' <"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/live-storefront-revision")"
    be_digest="$(tr -d '[:space:]' <"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/live-backend-digest")"
    sf_digest="$(tr -d '[:space:]' <"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/live-storefront-digest")"
  else
    be_image="$(docker inspect "$LIVE_BACKEND_CONTAINER" --format '{{.Image}}')"
    sf_image="$(docker inspect "$LIVE_STOREFRONT_CONTAINER" --format '{{.Image}}')"
    be_rev="$(docker inspect "$be_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    sf_rev="$(docker inspect "$sf_image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    be_digest="$(docker image inspect "$be_image" --format '{{json .RepoDigests}}')"
    sf_digest="$(docker image inspect "$sf_image" --format '{{json .RepoDigests}}')"
    [[ "$be_image" == "$EXPECTED_LIVE_BACKEND_IMAGE_ID" ]] || die "LIVE_APPLICATION_DRIFT backend image id"
    [[ "$sf_image" == "$EXPECTED_LIVE_STOREFRONT_IMAGE_ID" ]] || die "LIVE_APPLICATION_DRIFT storefront image id"
  fi
  [[ "$be_rev" == "$EXPECTED_LIVE_BACKEND_SHA" ]] || die "LIVE_APPLICATION_DRIFT backend revision"
  [[ "$sf_rev" == "$EXPECTED_LIVE_STOREFRONT_SHA" ]] || die "LIVE_APPLICATION_DRIFT storefront revision"
  [[ "$be_digest" == *"$EXPECTED_LIVE_BACKEND_REPO_DIGEST"* ]] || die "LIVE_APPLICATION_DRIFT backend digest"
  [[ "$sf_digest" == *"$EXPECTED_LIVE_STOREFRONT_REPO_DIGEST"* ]] || die "LIVE_APPLICATION_DRIFT storefront digest"
}

assert_database_gate() {
  local db_name regclass target_count dangerous image_sha file_sha image_digest
  db_name="$(query "select current_database();")"
  [[ "$db_name" == "$EXPECTED_DB" ]] || die "database identity refused: ${db_name:-empty}"
  if [[ "$RUNTIME_SCOPE" == "rehearsal" && "$db_name" == "$LIVE_DB" ]]; then
    die "database identity refused: rehearsal saw public production"
  fi
  regclass="$(query "select coalesce(to_regclass('public.product_compatibility')::text, '');")"
  target_count="$(query "select count(*) from mikro_orm_migrations where name = '${ALLOWED_MIGRATION}';")"
  dangerous="$(query "select count(*) from mikro_orm_migrations where name = 'Migration20250505101505';")"
  [[ "$dangerous" == "0" ]] || die "DANGEROUS_MIGRATION_PRESENT"
  if [[ "$target_count" != "0" && -z "$regclass" ]]; then
    die "BOOKKEEPING_WITHOUT_TABLE $ALLOWED_MIGRATION"
  fi
  if [[ "$target_count" != "0" && -n "$regclass" ]]; then
    die "ALREADY_APPLIED $ALLOWED_MIGRATION"
  fi
  if [[ -n "$regclass" && "$target_count" == "0" ]]; then
    die "PARTIAL_SCHEMA product_compatibility exists without migration bookkeeping"
  fi
  [[ "$target_count" == "0" ]] || die "PARTIAL_SCHEMA unexpected bookkeeping count"
  if [[ "${WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST:-}" == "1" ]]; then
    image_sha="$(tr -d '[:space:]' <"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/app-sha")"
    file_sha="$(tr -d '[:space:]' <"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/migration-sha")"
    image_digest="$(tr -d '[:space:]' <"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/image-digest")"
  else
    image_sha="$(docker inspect "$IMAGE_REF" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
    file_sha="$(docker run --rm --entrypoint sha256sum "$IMAGE_REF" "$MIGRATIONS_DIR/${ALLOWED_MIGRATION}.js" | awk '{print $1}')"
    image_digest="$(docker image inspect "$IMAGE_REF" --format '{{json .RepoDigests}}')"
  fi
  [[ "$image_sha" == "$EXPECTED_MIGRATION_IMAGE_SHA" ]] || die "migration image revision mismatch"
  [[ "$image_digest" == *"$EXPECTED_MIGRATION_IMAGE_DIGEST"* ]] || die "migration image digest mismatch"
  [[ "$file_sha" == "$EXPECTED_MIGRATION_SHA256" ]] || die "migration source hash mismatch"
  STATE_REGCLASS="$regclass"
  STATE_TARGET_COUNT="$target_count"
  STATE_DANGEROUS="$dangerous"
  STATE_MIGRATION_COUNT="$(query "select count(*) from mikro_orm_migrations;")"
}

assert_schema() {
  local columns constraints indexes foreigns rows tables_after migrations_after target_after dangerous_after
  columns="$(query "select column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default, '') from information_schema.columns where table_schema = 'public' and table_name = 'product_compatibility' order by ordinal_position;")"
  [[ "$columns" == $'id|text|NO|\naccessory_product_id|text|NO|\nproduct_id|text|NO|\ncreated_at|timestamp with time zone|NO|now()\nupdated_at|timestamp with time zone|NO|now()\ndeleted_at|timestamp with time zone|YES|' ]] \
    || die "schema columns mismatch"
  constraints="$(query "select conname || '|' || pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.product_compatibility'::regclass and contype in ('p','c') order by conname;")"
  [[ "$constraints" == *"product_compatibility_not_self|CHECK ((accessory_product_id <> product_id))"* ]] \
    || die "schema check constraint mismatch"
  [[ "$constraints" == *"product_compatibility_pkey|PRIMARY KEY (id)"* ]] || die "schema primary key mismatch"
  indexes="$(query "select indexdef from pg_indexes where schemaname = 'public' and tablename = 'product_compatibility' and indexname = 'IDX_product_compatibility_pair_unique';")"
  [[ "$indexes" == *'UNIQUE INDEX "IDX_product_compatibility_pair_unique"'* ]] || die "schema unique index mismatch"
  [[ "$indexes" == *"(accessory_product_id, product_id)"* ]] || die "schema unique index columns mismatch"
  [[ "$indexes" == *"deleted_at IS NULL"* ]] || die "schema unique index predicate mismatch"
  foreigns="$(query "select count(*) from pg_constraint where conrelid = 'public.product_compatibility'::regclass and contype = 'f';")"
  [[ "$foreigns" == "0" ]] || die "schema unexpected foreign key"
  rows="$(query "select count(*) from product_compatibility;")"
  [[ "$rows" == "0" ]] || die "schema row count is not zero"
  target_after="$(query "select count(*) from mikro_orm_migrations where name = '${ALLOWED_MIGRATION}';")"
  [[ "$target_after" == "1" ]] || die "bookkeeping count is not 1"
  dangerous_after="$(query "select count(*) from mikro_orm_migrations where name = 'Migration20250505101505';")"
  [[ "$dangerous_after" == "0" ]] || die "DANGEROUS_MIGRATION_PRESENT"
  migrations_after="$(query "select count(*) from mikro_orm_migrations;")"
  [[ "$migrations_after" == "$((STATE_MIGRATION_COUNT + 1))" ]] || die "bookkeeping total did not increase by 1"
  tables_after="$(query "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname = 'product_compatibility';")"
  [[ "$tables_after" == "1" ]] || die "product_compatibility missing after execute"
}

PG_EXEC="$PG_CONTAINER"
IMAGE_REF="$BACKEND_IMAGE"
assert_lock_ready
assert_live_application
assert_database_gate

if [[ "$MODE" == "dry-run" ]]; then
  python3 - \
    "$ALLOWED_MIGRATION" "$EXPECTED_DB" "$RUNTIME_SCOPE" "$EXPECTED_LIVE_BACKEND_SHA" \
    "$EXPECTED_MIGRATION_SHA256" "$STATE_TARGET_COUNT" "$STATE_DANGEROUS" "$STATE_MIGRATION_COUNT" <<'PY'
import json, sys
print(json.dumps({
    "mode": "dry-run",
    "mutation": False,
    "migration": sys.argv[1],
    "database": sys.argv[2],
    "runtime_scope": sys.argv[3],
    "live_backend_sha": sys.argv[4],
    "migration_sha256": sys.argv[5],
    "target_bookkeeping": int(sys.argv[6]),
    "dangerous_migration": int(sys.argv[7]),
    "migration_count": int(sys.argv[8]),
    "table": "absent",
    "backup_status": "success",
    "lock": "ready",
    "operation": "up Migration20261005120000 only",
}, sort_keys=True))
PY
  log "dry-run: no migration executed"
  printf '%s\n' "DRY_RUN_OK migration=$ALLOWED_MIGRATION"
  exit 0
fi

if [[ "${WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST:-}" != "1" ]]; then
  unset WOODRIGHT_STAGING_MUTATION_LOCK_HELD
  unset _WR_STAGING_LOCK_OWNED
  export WR_STAGING_MUTATION_LOCK_PATH="$LOCK_PATH"
  # shellcheck source=../lib/woodright-staging-mutation-lock.sh
  source "$LOCK_HELPER"
  wr_staging_mutation_lock_acquire \
    "actor=woodright-product-compatibility-migration" \
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
  assert_live_application
  assert_database_gate
fi

log "preflight ok scope=$RUNTIME_SCOPE migration=$ALLOWED_MIGRATION db=$EXPECTED_DB mode=$MODE"

if [[ "${WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST:-}" == "1" ]]; then
  plan="$(node "$RUNNER" --migration "$ALLOWED_MIGRATION")"
else
  plan="$(docker run --rm --entrypoint node -v "$RUNNER:/tmp/woodright-product-compatibility-migration.cjs:ro" "$IMAGE_REF" /tmp/woodright-product-compatibility-migration.cjs --migration "$ALLOWED_MIGRATION")"
fi
[[ "$plan" == *'"migrations":["'"$ALLOWED_MIGRATION"'"]'* ]] || die "runner plan did not select only $ALLOWED_MIGRATION"
[[ "$plan" == *'/server/src/modules/product-compatibility/migrations'* ]] || die "runner plan left the product-compatibility directory"
if [[ "$plan" == *"Migration20250505101505"* || "$plan" == *"Migration20260908120000"* || "$plan" == *"workflow-engine-redis"* || "$plan" == *"/translation/"* || "$plan" == *"/rbac/"* || "$plan" == *"/index/"* || "$plan" == *"promotion-slot"* ]]; then
  die "runner plan included a migration outside product-compatibility"
fi

if [[ "${WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_TEST:-}" == "1" ]]; then
  printf '%s\n' "$plan" >"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/plan.json"
  printf '%s\n' "$ALLOWED_MIGRATION" >"$WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FIXTURE_DIR/executed"
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
MIGRATION_NAME="woodright-product-compatibility-migration-$$"
trap 'on_migration_exit' EXIT
trap 'on_migration_int' INT
trap 'on_migration_term' TERM

docker run -d --name "$MIGRATION_NAME" \
  --network "container:${PG_EXEC}" \
  --entrypoint node \
  -e DATABASE_URL \
  -e WOODRIGHT_PRODUCT_COMPATIBILITY_MIGRATION_FRAMEWORK=1 \
  -v "$RUNNER:/tmp/woodright-product-compatibility-migration.cjs:ro" \
  "$IMAGE_REF" \
  /tmp/woodright-product-compatibility-migration.cjs \
  --migration "$ALLOWED_MIGRATION" \
  --migrations-dir "$MIGRATIONS_DIR" >/dev/null
set +e
framework_rc="$(docker wait "$MIGRATION_NAME")"
set -e
framework_logs="$(docker logs "$MIGRATION_NAME" 2>&1 || true)"
wait_until_migration_stopped
printf '%s\n' "$framework_logs" | python3 -c 'import sys,re; sys.stdout.write(re.sub(r"postgres(?:ql)?://[^@\s]+@", "postgres://redacted@", sys.stdin.read()))'
unset framework_logs DATABASE_URL
[[ "$framework_rc" == "0" ]] || die "framework container failed"

assert_schema
log "execute ok migration=$ALLOWED_MIGRATION"
printf '%s\n' "EXECUTE_OK migration=$ALLOWED_MIGRATION"
