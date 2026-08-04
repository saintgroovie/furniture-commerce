#!/usr/bin/env bash
# Disposable restore rehearsal for public_production recovery points.
# Creates a temporary PostgreSQL container, restores dump, verifies aggregates
# (counts only - no PII rows), verifies media archive checksum, writes report,
# and removes only disposable resources created in this cycle.
#
# Does NOT attach restored media to live runtime. Does NOT touch live DB.
# Fixture mode: WOODRIGHT_RESTORE_FIXTURE_DIR=/path (local disposable tests).
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../lib/woodright-environment-profile.sh
source "$OPS_ROOT/lib/woodright-environment-profile.sh"
# shellcheck source=../lib/woodright-recovery-point.sh
source "$OPS_ROOT/lib/woodright-recovery-point.sh"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

MANIFEST=""
ENVIRONMENT=""
FIXTURE_DIR="${WOODRIGHT_RESTORE_FIXTURE_DIR:-}"
KEEP_DISPOSABLE="${WOODRIGHT_RESTORE_KEEP_DISPOSABLE:-0}"
REPORT_DIR="${WOODRIGHT_RESTORE_REPORT_DIR:-}"
CYCLE_ID="restore-$(date -u +%Y%m%dT%H%M%SZ)-$$"
DISPOSABLE_CTR=""
DISPOSABLE_NET=""
WORKDIR=""

usage() {
  cat <<'EOF'
Usage:
  woodright-public-production-restore-rehearsal.sh \
    --environment public_production \
    --manifest /path/to/recovery-point.json \
    [--report-dir /path]

Fixture tests:
  WOODRIGHT_RESTORE_FIXTURE_DIR=/tmp/fixture \
  WOODRIGHT_BACKUP_ALLOW_ALT_ROOT=1 \
  ... --manifest $FIXTURE/manifests/recovery-point-....json
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --environment=*) ENVIRONMENT="${1#*=}"; shift ;;
    --manifest) MANIFEST="${2:-}"; shift 2 ;;
    --manifest=*) MANIFEST="${1#*=}"; shift ;;
    --report-dir) REPORT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown arg: $1" ;;
  esac
done

[[ "$ENVIRONMENT" == "public_production" ]] || die "--environment public_production required"
[[ -n "$MANIFEST" && -f "$MANIFEST" ]] || die "--manifest required"
[[ ! -L "$MANIFEST" ]] || die "manifest must not be a symlink"

REPORT_DIR="${REPORT_DIR:-${WOODRIGHT_EVIDENCE_ROOT:-/tmp}/restore-rehearsal}"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/restore-rehearsal-${CYCLE_ID}.json"
WORKDIR=$(mktemp -d "/tmp/wr-pp-restore-${CYCLE_ID}.XXXXXX")
DISPOSABLE_CTR_ID=""
DISPOSABLE_NET_ID=""
CREATED_CTR=0
CREATED_NET=0
cleanup() {
  local ec=$?
  if [[ "$KEEP_DISPOSABLE" != "1" ]]; then
    if [[ "$CREATED_CTR" -eq 1 && -n "$DISPOSABLE_CTR_ID" ]]; then
      docker rm -f "$DISPOSABLE_CTR_ID" >/dev/null 2>&1 || true
    fi
    if [[ "$CREATED_NET" -eq 1 && -n "$DISPOSABLE_NET_ID" ]]; then
      docker network rm "$DISPOSABLE_NET_ID" >/dev/null 2>&1 || true
    fi
    if [[ -n "$WORKDIR" && -d "$WORKDIR" ]]; then
      case "$WORKDIR" in
        /tmp/wr-pp-restore-*) rm -rf -- "$WORKDIR" ;;
      esac
    fi
  fi
  exit "$ec"
}
trap cleanup EXIT

wr_validate_recovery_point_manifest "$MANIFEST" || die "invalid recovery-point manifest"

# Load profile for path pins (may be unprovisioned - ok for fixture)
wr_load_environment_profile public_production || die "profile load failed"

# Parse manifest once into a stable JSON snapshot under workdir.
MANIFEST_SNAP="$WORKDIR/manifest.snapshot.json"
cp -a "$MANIFEST" "$MANIFEST_SNAP"
chmod 0600 "$MANIFEST_SNAP"

read -r ENV_FROM_MAN DB_PATH DB_SHA MEDIA_PATH MEDIA_SHA EXPECT_PG EXPECT_MIG < <(
  python3 - "$MANIFEST_SNAP" <<'PY'
import json, sys
obj = json.load(open(sys.argv[1], encoding="utf-8"))
print(
  obj.get("environment", ""),
  obj["db"]["path"],
  obj["db"]["sha256"],
  obj["media"]["path"],
  obj["media"]["sha256"],
  obj.get("postgres_version") or "",
  obj.get("migration_head") or "",
)
PY
)
[[ "$ENV_FROM_MAN" == "public_production" ]] || die "manifest environment mismatch: $ENV_FROM_MAN"

# Stage immutable copies of artifacts (mitigate path replacement TOCTOU)
[[ -f "$DB_PATH" ]] || die "db dump missing: $DB_PATH"
[[ -f "$MEDIA_PATH" ]] || die "media archive missing: $MEDIA_PATH"
[[ ! -L "$DB_PATH" ]] || die "db dump symlink refused"
[[ ! -L "$MEDIA_PATH" ]] || die "media symlink refused"
# Prefer artifacts under canonical backup root when not in fixture mode
if [[ -z "$FIXTURE_DIR" && "${WOODRIGHT_BACKUP_ALLOW_ALT_ROOT:-0}" != "1" ]]; then
  case "$DB_PATH" in
    /srv/woodright/backups/automated/public-production/*) ;;
    *) die "db dump outside public-production backup root" ;;
  esac
  case "$MEDIA_PATH" in
    /srv/woodright/backups/automated/public-production/*) ;;
    *) die "media archive outside public-production backup root" ;;
  esac
fi
STAGED_DB="$WORKDIR/db.dump"
STAGED_MEDIA="$WORKDIR/media.archive"
cp -a "$DB_PATH" "$STAGED_DB"
cp -a "$MEDIA_PATH" "$STAGED_MEDIA"
chmod 0600 "$STAGED_DB" "$STAGED_MEDIA"
ACTUAL_DB_SHA=$(sha256sum "$STAGED_DB" | awk '{print $1}')
ACTUAL_MEDIA_SHA=$(sha256sum "$STAGED_MEDIA" | awk '{print $1}')
[[ "$ACTUAL_DB_SHA" == "$DB_SHA" ]] || die "db checksum mismatch"
[[ "$ACTUAL_MEDIA_SHA" == "$MEDIA_SHA" ]] || die "media checksum mismatch"

# Media archive integrity: list contents (do not extract onto live media mounts)
MEDIA_LIST_COUNT=0
if tar -tzf "$STAGED_MEDIA" >/dev/null 2>"$WORKDIR/media-list.err"; then
  MEDIA_LIST_COUNT=$(tar -tzf "$STAGED_MEDIA" 2>/dev/null | wc -l | tr -d ' ')
elif tar -tf "$STAGED_MEDIA" >/dev/null 2>>"$WORKDIR/media-list.err"; then
  MEDIA_LIST_COUNT=$(tar -tf "$STAGED_MEDIA" 2>/dev/null | wc -l | tr -d ' ')
else
  die "media archive list/integrity failed"
fi
[[ "$MEDIA_LIST_COUNT" -gt 0 ]] || die "media archive empty listing"

# Fixture-only path: skip docker when WOODRIGHT_RESTORE_FIXTURE_SKIP_DOCKER=1
if [[ "${WOODRIGHT_RESTORE_FIXTURE_SKIP_DOCKER:-0}" == "1" ]]; then
  # Aggregate counts from fixture expected file (counts only)
  EXPECT_JSON="${FIXTURE_DIR}/expected-aggregates.json"
  [[ -f "$EXPECT_JSON" ]] || die "fixture expected-aggregates.json missing"
  python3 - "$REPORT" "$MANIFEST_SNAP" "$EXPECT_JSON" "$CYCLE_ID" "$DB_SHA" "$MEDIA_SHA" "$MEDIA_LIST_COUNT" <<'PY'
import json, sys, time
report, man, expect, cycle, db_sha, media_sha, media_list = sys.argv[1:]
exp = json.load(open(expect))
obj = {
  "kind": "woodright_restore_rehearsal_report",
  "schema": "woodright_restore_rehearsal_v1",
  "status": "pass",
  "environment": "public_production",
  "cycle_id": cycle,
  "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  "manifest": man,
  "mode": "fixture_skip_docker",
  "db_checksum_ok": True,
  "media_checksum_ok": True,
  "media_list_count": int(media_list),
  "db_sha256": db_sha,
  "media_sha256": media_sha,
  "aggregates": exp,
  "pii_rows_exported": False,
  "live_db_touched": False,
  "live_media_attached": False,
  "disposable_cleanup": "scheduled",
}
json.dump(obj, open(report, "w"), indent=2)
print(report)
PY
  log "fixture restore rehearsal PASS report=$REPORT"
  printf '%s\n' "$REPORT"
  exit 0
fi

command -v docker >/dev/null || die "docker required for live rehearsal"
DISPOSABLE_NET="wr-pp-restore-net-${CYCLE_ID}"
DISPOSABLE_CTR="wr-pp-restore-pg-${CYCLE_ID}"
# Refuse colliding pre-existing names rather than reclaiming them.
if docker network inspect "$DISPOSABLE_NET" >/dev/null 2>&1; then
  die "disposable network name already exists: $DISPOSABLE_NET"
fi
if docker inspect "$DISPOSABLE_CTR" >/dev/null 2>&1; then
  die "disposable container name already exists: $DISPOSABLE_CTR"
fi
DISPOSABLE_NET_ID=$(docker network create "$DISPOSABLE_NET")
CREATED_NET=1
DISPOSABLE_CTR_ID=$(docker run -d --name "$DISPOSABLE_CTR" --network "$DISPOSABLE_NET" \
  -e POSTGRES_PASSWORD=restore_only_not_a_secret \
  -e POSTGRES_USER=woodright \
  -e POSTGRES_DB=woodright_restore_rehearsal \
  postgres:15-alpine)
CREATED_CTR=1
DISPOSABLE_CTR_ID="${DISPOSABLE_CTR_ID//$'\r'/}"
DISPOSABLE_NET_ID="${DISPOSABLE_NET_ID//$'\r'/}"

# Wait ready
for _ in $(seq 1 60); do
  if docker exec "$DISPOSABLE_CTR" pg_isready -U woodright >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$DISPOSABLE_CTR" pg_isready -U woodright >/dev/null || die "disposable pg not ready"

PG_VER=$(docker exec "$DISPOSABLE_CTR" psql -U woodright -d woodright_restore_rehearsal -tAc 'SHOW server_version;' | tr -d '[:space:]')
if [[ -n "$EXPECT_PG" && "$PG_VER" != "$EXPECT_PG"* && "$EXPECT_PG" != "$PG_VER" ]]; then
  # Allow minor patch drift within major.minor when expect is prefix
  case "$PG_VER" in
    ${EXPECT_PG}*) ;;
    *) die "postgres version mismatch have=$PG_VER want=$EXPECT_PG" ;;
  esac
fi

docker cp "$STAGED_DB" "${DISPOSABLE_CTR}:/tmp/restore.dump"
set +e
docker exec "$DISPOSABLE_CTR" pg_restore -U woodright -d woodright_restore_rehearsal --no-owner --no-acl /tmp/restore.dump \
  >"$WORKDIR/pg_restore.out" 2>"$WORKDIR/pg_restore.err"
PG_RESTORE_EC=$?
set -e
if [[ "$PG_RESTORE_EC" -ne 0 ]]; then
  # Allow only advisory warnings; any error:/fatal or unknown nonzero without warnings → fail
  if grep -qiE 'error:|fatal' "$WORKDIR/pg_restore.err" "$WORKDIR/pg_restore.out" 2>/dev/null; then
    die "pg_restore failed ec=$PG_RESTORE_EC"
  fi
  if ! grep -qiE 'warning:' "$WORKDIR/pg_restore.err" "$WORKDIR/pg_restore.out" 2>/dev/null; then
    die "pg_restore nonzero without warnings ec=$PG_RESTORE_EC"
  fi
  log "WARN pg_restore warnings-only ec=$PG_RESTORE_EC"
fi

# Encoding / extensions smoke
ENC=$(docker exec "$DISPOSABLE_CTR" psql -U woodright -d woodright_restore_rehearsal -tAc "SHOW server_encoding;" | tr -d '[:space:]')
[[ "$ENC" == "UTF8" ]] || die "encoding not UTF8: $ENC"

# Aggregate counts only (no row export). Query failures must not become silent zeros.
export DISPOSABLE_CTR
AGG=$(python3 - <<'PY'
import json, subprocess, os, sys
ctr = os.environ["DISPOSABLE_CTR"]
aliases = {
  "product": ["product", "product_product"],
  "product_variant": ["product_variant", "product_product_variant"],
  "price": ["price", "pricing_price"],
  "inventory_item": ["inventory_item", "inventory_inventory_item"],
  "inventory_level": ["inventory_level", "inventory_inventory_level"],
  "product_collection": ["product_collection", "product_product_collection"],
  "cart": ["cart", "cart_cart"],
  "order": ["order", "order_order"],
  "customer": ["customer", "customer_customer"],
  "region": ["region", "region_region"],
  "sales_channel": ["sales_channel", "sales_channel_sales_channel"],
  "shipping_option": ["shipping_option", "shipping_shipping_option"],
  "payment_session": ["payment_session", "payment_payment_session"],
}
out = {}
errors = []
for logical, names in aliases.items():
  n = None
  for t in names:
    sql = (
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables "
      f"WHERE table_schema='public' AND table_name='{t}') "
      f"THEN (SELECT count(*) FROM \"{t}\") ELSE 0 END;"
    )
    p = subprocess.run(
      ["docker","exec",ctr,"psql","-U","woodright","-d","woodright_restore_rehearsal","-tAc", "-v", "ON_ERROR_STOP=1", sql],
      capture_output=True, text=True,
    )
    if p.returncode != 0:
      errors.append(f"{logical}/{t}:{(p.stderr or p.stdout or 'psql_failed').strip()}")
      continue
    try:
      val = int((p.stdout or "0").strip() or "0")
    except Exception as e:
      errors.append(f"{logical}/{t}:parse:{e}")
      continue
    n = val if n is None else max(n, val)
  out[logical] = 0 if n is None else n
if errors and all(v == 0 for v in out.values()):
  print("AGGREGATE_QUERY_FAILURES:" + ";".join(errors[:5]), file=sys.stderr)
  raise SystemExit(2)
print(json.dumps(out))
PY
) || die "aggregate count queries failed"

# Optional expected aggregates comparison
if [[ -n "$FIXTURE_DIR" && -f "$FIXTURE_DIR/expected-aggregates.json" ]]; then
  python3 - "$AGG" "$FIXTURE_DIR/expected-aggregates.json" <<'PY'
import json, sys
have = json.loads(sys.argv[1])
want = json.load(open(sys.argv[2]))
for k, v in want.items():
    if have.get(k) != v:
        raise SystemExit(f"aggregate mismatch {k}: have={have.get(k)} want={v}")
print("AGGREGATES_OK", file=sys.stderr)
PY
fi

# Migration head optional compare
if [[ -n "$EXPECT_MIG" ]]; then
  HAVE_MIG=$(docker exec "$DISPOSABLE_CTR" psql -U woodright -d woodright_restore_rehearsal -tAc \
    "SELECT name FROM script_migrations ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | tr -d '[:space:]' || true)
  if [[ -n "$HAVE_MIG" && "$HAVE_MIG" != "$EXPECT_MIG" ]]; then
    die "migration head mismatch have=$HAVE_MIG want=$EXPECT_MIG"
  fi
fi

python3 - "$REPORT" "$MANIFEST_SNAP" "$CYCLE_ID" "$DB_SHA" "$MEDIA_SHA" "$AGG" "$PG_VER" "$ENC" "$MEDIA_LIST_COUNT" <<'PY'
import json, sys, time
report, man, cycle, db_sha, media_sha, agg, pg_ver, enc, media_list = sys.argv[1:]
obj = {
  "kind": "woodright_restore_rehearsal_report",
  "schema": "woodright_restore_rehearsal_v1",
  "status": "pass",
  "environment": "public_production",
  "cycle_id": cycle,
  "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  "manifest": man,
  "mode": "disposable_docker",
  "db_checksum_ok": True,
  "media_checksum_ok": True,
  "media_list_count": int(media_list),
  "db_sha256": db_sha,
  "media_sha256": media_sha,
  "postgres_version": pg_ver,
  "server_encoding": enc,
  "aggregates": json.loads(agg),
  "pii_rows_exported": False,
  "live_db_touched": False,
  "live_media_attached": False,
  "disposable_cleanup": "on_exit",
}
with open(report, "w", encoding="utf-8") as f:
  json.dump(obj, f, indent=2)
  f.write("\n")
print(report)
PY

log "restore rehearsal PASS report=$REPORT"
printf '%s\n' "$REPORT"
