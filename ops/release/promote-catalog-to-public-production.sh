#!/usr/bin/env bash
# Catalog-safe promotion into isolated public_production Postgres.
#
# Policy (docs/operator/dokploy-staging.md + public-production-data-promotion.md):
# - READ source = private production_candidate DB (default) or explicit --source-*
# - WRITE target = woodright_public_production only
# - Copy full schema/data, then SCRUB customers/orders/carts/payments/sessions/
#   notifications/leads/bespoke while KEEPING catalog, media refs, sales channel,
#   publishable API keys, and admin user identity needed for Medusa boot.
# - Never mutates source. Never reuses demo/private volumes as writable target.
#
# Usage (on operator host with Docker):
#   bash ops/release/promote-catalog-to-public-production.sh \
#     --confirm-catalog-promote \
#     [--source-container woodright-production-postgres] \
#     [--source-db woodright_production] \
#     [--source-user woodright_production] \
#     [--target-container woodright-public-production-postgres] \
#     [--target-db woodright_public_production] \
#     [--target-user woodright]
#
# Exit: 0 ok | 1 failure | 2 usage | 3 purge-failed-after-mutation (manual quarantine)
set -Eeuo pipefail

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }

MUTATING_TARGET=0

# Hard fail-closed purge: must not swallow docker/psql errors while a mutated
# target may still contain unsanitized customer/order rows.
purge_target_schema() {
  log "FAIL-CLOSED purge target schema public on ${TARGET_CONTAINER:?}/${TARGET_DB:?}"
  docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
SQL
}

fail_closed_purge_or_critical() {
  if purge_target_schema; then
    return 0
  fi
  log "CRITICAL PUBLIC_PRODUCTION_CATALOG_PROMOTE_PURGE_FAILED target may retain unsanitized data - manual quarantine required"
  return 3
}

die() {
  log "ERROR: $*"
  if [[ "${MUTATING_TARGET:-0}" == "1" ]]; then
    fail_closed_purge_or_critical || exit 3
  fi
  exit 1
}

on_promote_err() {
  local ec=$?
  log "promotion failed (exit=$ec); purging target to avoid unsanitized residual data"
  fail_closed_purge_or_critical || exit 3
  exit "$ec"
}

CONFIRM=0
SOURCE_CONTAINER=woodright-production-postgres
SOURCE_DB=woodright_production
SOURCE_USER=woodright_production
TARGET_CONTAINER=woodright-public-production-postgres
TARGET_DB=woodright_public_production
TARGET_USER=woodright
WORK_DIR="${WOODRIGHT_CATALOG_PROMOTE_WORKDIR:-/srv/woodright/import/public-production-catalog}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm-catalog-promote) CONFIRM=1; shift ;;
    --source-container) SOURCE_CONTAINER="${2:-}"; shift 2 ;;
    --source-db) SOURCE_DB="${2:-}"; shift 2 ;;
    --source-user) SOURCE_USER="${2:-}"; shift 2 ;;
    --target-container) TARGET_CONTAINER="${2:-}"; shift 2 ;;
    --target-db) TARGET_DB="${2:-}"; shift 2 ;;
    --target-user) TARGET_USER="${2:-}"; shift 2 ;;
    --work-dir) WORK_DIR="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

[[ "$CONFIRM" == "1" ]] || die "refusing without --confirm-catalog-promote"

case "$TARGET_DB" in
  woodright_public_production) ;;
  *) die "refusing unexpected target DB=$TARGET_DB" ;;
esac
case "$SOURCE_DB" in
  woodright_public_production) die "source must not equal public production target" ;;
  woodright_staging|woodright_production) ;;
  *) die "refusing unexpected source DB=$SOURCE_DB (allowed: woodright_production|woodright_staging)" ;;
esac
[[ "$SOURCE_CONTAINER" != "$TARGET_CONTAINER" ]] || die "source and target containers must differ"

command -v docker >/dev/null || die "docker required"
docker inspect "$SOURCE_CONTAINER" >/dev/null 2>&1 || die "source container missing: $SOURCE_CONTAINER"
docker inspect "$TARGET_CONTAINER" >/dev/null 2>&1 || die "target container missing: $TARGET_CONTAINER"

mkdir -p "$WORK_DIR"
chmod 700 "$WORK_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$WORK_DIR/source-${SOURCE_DB}-${TS}.dump"
SCRUB_SQL="$WORK_DIR/scrub-${TS}.sql"
REPORT="$WORK_DIR/promote-report-${TS}.json"

log "count source products"
SRC_PRODUCTS=$(docker exec "$SOURCE_CONTAINER" psql -U "$SOURCE_USER" -d "$SOURCE_DB" -tAc 'SELECT count(*) FROM product')
SRC_VARIANTS=$(docker exec "$SOURCE_CONTAINER" psql -U "$SOURCE_USER" -d "$SOURCE_DB" -tAc 'SELECT count(*) FROM product_variant')
SRC_CUSTOMERS=$(docker exec "$SOURCE_CONTAINER" psql -U "$SOURCE_USER" -d "$SOURCE_DB" -tAc 'SELECT count(*) FROM customer')
SRC_ORDERS=$(docker exec "$SOURCE_CONTAINER" psql -U "$SOURCE_USER" -d "$SOURCE_DB" -tAc 'SELECT count(*) FROM "order"')
log "source products=$SRC_PRODUCTS variants=$SRC_VARIANTS customers=$SRC_CUSTOMERS orders=$SRC_ORDERS"

log "pg_dump source -> $DUMP"
docker exec "$SOURCE_CONTAINER" pg_dump -U "$SOURCE_USER" -d "$SOURCE_DB" -Fc --no-owner --no-acl >"$DUMP"
[[ -s "$DUMP" ]] || die "empty dump"
DUMP_SHA=$(sha256sum "$DUMP" | awk '{print $1}')
DUMP_SIZE=$(wc -c <"$DUMP" | tr -d ' ')

# From first target mutation until scrub proof completes, any failure must leave
# an empty schema (never a half-restored DB with customers/orders).
MUTATING_TARGET=1
trap on_promote_err ERR

log "terminate target sessions + drop/recreate schema public"
purge_target_schema

log "pg_restore into target"
docker exec -i "$TARGET_CONTAINER" pg_restore -U "$TARGET_USER" -d "$TARGET_DB" --no-owner --no-acl --exit-on-error <"$DUMP" \
  || die "pg_restore failed"

cat >"$SCRUB_SQL" <<'SQL'
-- Catalog-safe scrub: remove buyer/session/commerce history; keep catalog + keys.
BEGIN;
TRUNCATE TABLE
  woodright_notification_delivery,
  woodright_order_process_event,
  woodright_order_process,
  woodright_order_access,
  notification,
  bespoke_request,
  lead,
  cart_line_item_adjustment,
  cart_line_item_tax_line,
  cart_shipping_method_adjustment,
  cart_shipping_method_tax_line,
  cart_shipping_method,
  cart_payment_collection,
  cart_promotion,
  cart_line_item,
  cart_address,
  cart,
  order_line_item_adjustment,
  order_line_item_tax_line,
  order_shipping_method_adjustment,
  order_shipping_method_tax_line,
  order_shipping_method,
  order_shipping,
  order_item,
  order_line_item,
  order_change_action,
  order_change,
  order_claim_item_image,
  order_claim_item,
  order_claim,
  order_exchange_item,
  order_exchange,
  order_fulfillment,
  order_payment_collection,
  order_promotion,
  order_credit_line,
  order_transaction,
  order_summary,
  order_cart,
  order_address,
  "order",
  return_item,
  return_fulfillment,
  return,
  fulfillment_item,
  fulfillment_label,
  fulfillment_address,
  fulfillment,
  reservation_item,
  payment_session,
  payment,
  payment_link,
  capture,
  refund,
  credit_line,
  payment_collection,
  customer_group_customer,
  customer_address,
  customer_account_holder,
  customer,
  account_holder,
  auth_mfa_recovery_code,
  auth_mfa_factor,
  auth_password_reset_token,
  auth_verification,
  invite_rbac_role,
  invite,
  workflow_execution
CASCADE;
COMMIT;
SQL

log "apply scrub"
docker exec -i "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 <"$SCRUB_SQL"

DST_PRODUCTS=$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -tAc 'SELECT count(*) FROM product')
DST_VARIANTS=$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -tAc 'SELECT count(*) FROM product_variant')
DST_CUSTOMERS=$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -tAc 'SELECT count(*) FROM customer')
DST_ORDERS=$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -tAc 'SELECT count(*) FROM "order"')
DST_CARTS=$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -tAc 'SELECT count(*) FROM cart')
DST_KEYS=$(docker exec "$TARGET_CONTAINER" psql -U "$TARGET_USER" -d "$TARGET_DB" -tAc 'SELECT count(*) FROM api_key')

[[ "$DST_PRODUCTS" == "$SRC_PRODUCTS" ]] || die "product count mismatch src=$SRC_PRODUCTS dst=$DST_PRODUCTS"
[[ "$DST_VARIANTS" == "$SRC_VARIANTS" ]] || die "variant count mismatch src=$SRC_VARIANTS dst=$DST_VARIANTS"
[[ "$DST_CUSTOMERS" == "0" ]] || die "customers not scrubbed: $DST_CUSTOMERS"
[[ "$DST_ORDERS" == "0" ]] || die "orders not scrubbed: $DST_ORDERS"
[[ "$DST_CARTS" == "0" ]] || die "carts not scrubbed: $DST_CARTS"
[[ "$DST_KEYS" -ge 1 ]] || die "api_key missing after promote"

# Scrub proof passed - clear fail-closed purge path.
MUTATING_TARGET=0
trap - ERR

python3 - <<PY
import json
doc={
  "kind":"woodright_catalog_safe_promotion",
  "status":"pass",
  "timestamp_utc":"$TS",
  "source":{"container":"$SOURCE_CONTAINER","db":"$SOURCE_DB","products":int("$SRC_PRODUCTS"),"variants":int("$SRC_VARIANTS"),"customers":int("$SRC_CUSTOMERS"),"orders":int("$SRC_ORDERS")},
  "target":{"container":"$TARGET_CONTAINER","db":"$TARGET_DB","products":int("$DST_PRODUCTS"),"variants":int("$DST_VARIANTS"),"customers":int("$DST_CUSTOMERS"),"orders":int("$DST_ORDERS"),"carts":int("$DST_CARTS"),"api_keys":int("$DST_KEYS")},
  "dump":{"path":"$DUMP","sha256":"$DUMP_SHA","bytes":int("$DUMP_SIZE")},
  "policy":"catalog_keep_scrub_customers_orders_carts_payments_sessions_notifications"
}
open("$REPORT","w").write(json.dumps(doc,indent=2)+"\n")
print(json.dumps(doc,indent=2))
PY

log "PUBLIC_PRODUCTION_CATALOG_PROMOTION_PASS report=$REPORT"
exit 0
