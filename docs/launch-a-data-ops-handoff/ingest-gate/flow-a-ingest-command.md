# Flow A scoped ingest — exact commands (next step)

**Status:** plan only — **not executed** in ingest gate prompt.

## 0. Preflight (read-only)

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce
git branch --show-current && git rev-parse --short HEAD
test -f tmp/launch-a-ingest-gate/flow-a-request-mode-product-draft.json && echo seed_json_ok
node tmp/launch-a-ingest-gate/_db-audit.mjs | tee tmp/launch-a-ingest-gate/db-audit-pre-apply.json
curl -s --max-time 5 http://localhost:9000/health
```

## 1. Backup (required before apply)

```bash
mkdir -p /Users/leonidmbp/Documents/projects/furniture-commerce/tmp/launch-a-ingest-gate/backups
# Use local pg_dump with DATABASE_URL from apps/backend/.env
cd /Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend
set -a && source .env && set +a
pg_dump "$DATABASE_URL" -Fc -f "../../tmp/launch-a-ingest-gate/backups/pre-flow-a-28-$(date +%Y%m%d-%H%M).dump"
```

## 2. Dry-run (after script exists)

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend

WW_FLOW_A_PILOT_DRY_RUN=1 \
WW_FLOW_A_PILOT_CONFIRM=1 \
yarn medusa exec ./src/scripts/seed-willie-winkie-flow-a-pilot-28.ts
```

## 3. Apply (operator-approved only)

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend

WW_FLOW_A_PILOT_CONFIRM=1 \
yarn medusa exec ./src/scripts/seed-willie-winkie-flow-a-pilot-28.ts
```

## 4. Post-ingest validation (read-only)

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend

WW_FLOW_A_PILOT_POST_INGESTION_VALIDATE=1 \
yarn medusa exec ./src/scripts/validate-willie-winkie-flow-a-post-ingestion.ts
```

Proposed validator checks:

- Postgres / product module: **28/28** whitelist handles exist
- All `status=draft`
- All `product_classification.product_type=CONFIGURABLE`
- Metadata `launch_mode=request_quote`
- No tier prices in variants beyond reference default
- Oxford-4 spot-check: existing 4 oxford handles unchanged
- Total product count = 143 + 28 = **171** (if all created)

## 5. Rollback (if needed)

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend
set -a && source .env && set +a
pg_restore -c -d "$DATABASE_URL" ../../tmp/launch-a-ingest-gate/backups/pre-flow-a-28-YYYYMMDD-HHMM.dump
```

## Allowed DB mutations (apply step only)

| Entity | Action |
|--------|--------|
| `product_collection` | create `willie-winkie` (+ `molly` if confirmed) |
| `product_category` | create `stoly-i-stoliki` if missing |
| `product` | create up to 28 draft products (skip existing handles) |
| `product_variant` | one default variant per product, reference price |
| `product_classification` | CONFIGURABLE + link |
| `inventory_level` | pilot SKUs only (Oxford pattern) |
| `region` | RUB idempotent ensure |

## Not touched

- `data/normalized/**`
- Full `yarn seed` / `seed-real-data.ts`
- 143 existing non-pilot products
- Product images / static media
- CO-02-1, orphan P0, matrix CSV
