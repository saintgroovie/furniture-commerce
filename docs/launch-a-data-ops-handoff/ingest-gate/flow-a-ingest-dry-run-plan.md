# Flow A scoped ingest — dry-run plan

**Pilot:** Willie Winkie / Molly Flow A — 28 handles  
**Launch mode:** `request_quote` · **Status:** `draft` · **Option A**

## Preconditions (must pass before any DB write)

- [ ] `operator-approval-summary.json` → `operator_matrix_approved: true` ✅
- [ ] `flow-a-ingest-whitelist.json` → exactly 28 handles, no CO-02-1 / AM-02-1 ✅
- [ ] `flow-a-request-mode-product-draft.json` → 28 rows, no tier prices invented ✅
- [ ] Operator decision on **mo-02-1** collection metadata (see ready-scope-summary.md)
- [ ] Postgres backup: `pg_dump` → `tmp/launch-a-ingest-gate/backups/pre-flow-a-28-$(date +%Y%m%d-%H%M).sql`
- [ ] Backend running on `:9000` (reuse existing; do not start second instance without approval)

## Phase 0 — Script creation (next engineering step, not done)

Create isolated exec script mirroring Oxford-4:

| Reference | Path |
|-----------|------|
| Pattern | `apps/backend/dist/src/scripts/seed-oxford-pilot-four.js` |
| Post-validate pattern | `apps/backend/dist/src/scripts/validate-oxford-pilot-four-post-ingestion.js` |
| New script (proposed) | `apps/backend/src/scripts/seed-willie-winkie-flow-a-pilot-28.ts` |

Script requirements:

1. Load **only** `tmp/launch-a-ingest-gate/flow-a-request-mode-product-draft.json`
2. Assert whitelist = 28 handles from `flow-a-ingest-whitelist.json`
3. `WW_FLOW_A_PILOT_CONFIRM=1` gate (skip if unset)
4. `WW_FLOW_A_PILOT_DRY_RUN=1` → validate payloads, log create/skip counts, **zero writes**
5. Idempotent: list existing handles → create missing only
6. Ensure collections: `willie-winkie` (+ `molly` if operator confirms)
7. Ensure categories: `komody`, `stellazhi`, `shkafy`, **`stoly-i-stoliki`**
8. Product `status: draft` (not published — Launch A)
9. `product_classification.product_type = CONFIGURABLE`
10. Metadata: `launch_mode`, `material_tiers` labels, `reference_price_rub`, Kids routing fields
11. Single default variant with reference price (kopecks); **no tier variant prices**
12. **No images** in create payload (media = separate gate)
13. Never read/write `data/normalized/seed-products.json` or `seed-real-data.ts`

## Phase 1 — Dry-run execution

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend

WW_FLOW_A_PILOT_DRY_RUN=1 \
WW_FLOW_A_PILOT_CONFIRM=1 \
yarn medusa exec ./src/scripts/seed-willie-winkie-flow-a-pilot-28.ts
```

Expected dry-run output:

- `products_to_create=28`, `already_present=0` (first run)
- `collections_to_ensure=[willie-winkie, …]`
- `categories_to_ensure=[…, stoly-i-stoliki]`
- `refusal` if any handle outside whitelist
- **No** `createProductsWorkflow` calls when `DRY_RUN=1`

## Phase 2 — Read-only post-dry-run checks

```bash
node /Users/leonidmbp/Documents/projects/furniture-commerce/tmp/launch-a-ingest-gate/_db-audit.mjs \
  | tee tmp/launch-a-ingest-gate/db-audit-pre-apply.json
# Expect draft_handles_missing: 28 (unchanged after dry-run)
```

## Refusal conditions (abort apply)

- Whitelist count ≠ 28
- Any `co-02-1` / `am-02-1` in payload
- Any `material_tiers.*.price_rub` set with `price_known: true`
- `operator_matrix_approved` false
- Existing pilot handle with conflicting collection/category (manual review → upsert policy)
- No backup file present

## Rollback plan

1. Stop further apply immediately
2. Restore from `pg_dump` backup
3. Re-run read-only `_db-audit.mjs` → confirm 143 products, 0/28 pilot handles
4. Document incident in tmp artifact; do not mutate `data/normalized/**`

## Explicitly not in dry-run scope

- Product-media apply
- Storefront catalog-scope / kids resolver code changes
- Publishing products (`status: published`)
- Online payment / checkout pricing
