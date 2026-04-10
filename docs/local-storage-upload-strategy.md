# Local Storage Upload Strategy (MVP)

## Scope and intent

This strategy defines controlled asset upload into Medusa local storage for MVP/staging and keeps storage concerns separate from entity mapping concerns.

- **Storage layer input:** `data/normalized/asset-upload-execution-manifest.json`
- **Entity mapping source of truth:** `data/normalized/entity-mapping.json` and `data/normalized/product-asset-binding.json`
- **Out of scope:** unresolved, excluded, or business-blocked products

## Processed asset -> Medusa local storage flow

1. Use `asset-upload-execution-manifest.json` as the executable upload plan.
2. For each entry:
   - read `processed_path` from `data/processed/storefront-assets/...`
   - copy file into `apps/backend/uploads/{target_storage_key}`
3. Validate destination file exists and matches source content hash.
4. Persist deterministic run artifacts:
   - `data/processed/asset-manifests/local-upload-status.json`
   - `data/processed/asset-manifests/local-upload-failures.json`
   - `data/processed/asset-manifests/local-upload-summary.json`

## Recommended local storage path layout

- **Filesystem root in repo:** `apps/backend/uploads`
- **Storage key root:** `products`
- **Final layout:**
  - `apps/backend/uploads/products/{collection}/{filename}.jpg`

Examples:

- `apps/backend/uploads/products/oliver/OL-01-2_main.jpg`
- `apps/backend/uploads/products/provence/PV-02-1_gallery_01.jpg`
- `apps/backend/uploads/products/country-london-paris/CO-02-1_color_blue_01.jpg`

## Storage key -> public URL mapping

Stable key mapping rule:

- `target_storage_key = products/{collection}/{filename}`
- `target_public_url = {ASSET_BASE_URL}/{target_storage_key}`

For local MVP/staging:

- **Exact assumption:** `ASSET_BASE_URL=http://localhost:9000/uploads`
- Example URL:
  - `http://localhost:9000/uploads/products/oliver/OL-01-2_main.jpg`

## Provenance preservation

Provenance chain remains explicit and reviewable:

- `asset-upload-execution-manifest.json`
  - `processed_path` -> `target_storage_key` -> `target_public_url`
- `product-asset-binding.json`
  - workbook identity and quality context
- `processed-assets.json`
  - processed file metadata and source linkage
- upload run artifacts
  - per-entry execution result, validation status, and failures

This preserves deterministic traceability from workbook product key to final public URL.

## Idempotency and overwrite policy

Script: `scripts/upload-assets-to-local-storage.py`

- existing destination + identical content -> `skipped_identical`
- existing destination + different content -> fail (safe default)
- optional explicit override -> `--overwrite-different`
- missing source -> fail, record in failures manifest

This avoids accidental destructive replacement in local storage.

## Why excluded products remain out of scope

Excluded categories (`unresolved_mapping`, `blocked_by_business_decision`, `no_confirmed_assets`) are intentionally not uploaded for this first seed scope because:

- they do not satisfy confirmed mapping/asset readiness,
- they risk contaminating first deterministic seed with fuzzy or blocked business decisions,
- they violate the requirement to keep backend seed data strictly grounded in confirmed inputs.

Therefore upload execution is limited to seed-eligible, confirmed subset only.
