# Post-seed asset URL fix report

## Summary

Real-data product image URLs pointed at `http://localhost:9000/uploads/...`, which Medusa v2 does not expose via `express.static`. Files were materialized under `apps/backend/uploads/`, while the only built-in static HTTP mount is `/static` → `apps/backend/static`. Greenwich already used `/static/{storage_key}`. We aligned materialization, seed JSON URLs, execution manifest assumptions, and draft `seed-real-data.ts` (including a one-pass image refresh for existing rows) with that model. After repair, **441** unique image URLs from `seed-products.fixed2.json` return **HTTP 200**; Greenwich sample **GR-02-1_gallery_01.jpg** still returns **200**.

## Scope / non-goals

- In scope: draft real-data path, upload script destination + default `ASSET_BASE_URL`, normalized seed/manifest JSON, docs that described the wrong `/uploads` assumption, optional DB image field refresh for the 109-handle subset.
- Out of scope: `seed.ts`, storefront, reverse-proxy-only workarounds, CDN/S3 migration, excluded/blocked catalog rows, business/catalog rules.

## Root cause

- **Verified in code:** `@medusajs/framework` `express-loader.js` registers `app.use("/static", express.static(path.join(baseDir, "static")))`. There is **no** default route serving `apps/backend/uploads` at `/uploads`.
- **Why URLs were wrong:** `scripts/upload-assets-to-local-storage.py` defaulted `ASSET_BASE_URL` to `http://localhost:9000/uploads` and copied files to `apps/backend/uploads`, matching outdated MVP notes—not the framework’s static middleware.
- **Why `/static` worked for Greenwich:** `seed-greenwich.ts` builds `buildImageUrl` as `` `${base}/static/${storageKey}` `` and files live under `static/products/greenwich/...`.
- **Why `/uploads` 404’d:** Request path `/uploads/...` is not mapped to the filesystem tree used for local assets in this setup.

## Chosen fix and why

1. **Materialize** MVP real-data files into `apps/backend/static/{target_storage_key}` (same layout Greenwich uses under `static/products/...`).
2. **Default public base** `ASSET_BASE_URL=http://localhost:9000/static`; regenerate/repair JSON URLs and execution manifest `target_public_url` fields.
3. **Draft seed:** Prefer `seed-products.fixed2.json`, then `fixed`, then generator output; after load, **`updateProducts`** thumbnail + images for all handles in the seed file so existing DB rows pick up new URLs without recreating products.

This is minimal, one public URL model, and consistent with Medusa v2 and existing Greenwich behavior. Wiring `/uploads` in nginx or custom Express would duplicate a second public scheme without benefit here.

## Files changed

- `scripts/upload-assets-to-local-storage.py` — destination `apps/backend/static`, default `ASSET_BASE_URL`, summary fields `materialization_root` (+ legacy keys preserved).
- `apps/backend/src/scripts/seed-real-data.ts` — `fixed2` → `fixed` → `seed-products.json`; image URL alignment loop.
- `data/normalized/*` — seed URLs, `asset-upload-execution-manifest.json` / summary, optional `seed-products.fixed2.json` & summaries when tracked.
- `data/processed/asset-manifests/local-upload-*.json` — last upload run against new root.
- Docs: `docs/assets/local-storage-upload-strategy.md`, `docs/local-storage-upload-strategy.md`, `docs/real-seed-readiness-report.md`, `docs/seed-generation-plan.md`.
- This report and `data/normalized/post-seed-asset-url-fix-summary.json`.

## Runtime actions performed

1. Ran `python3 scripts/upload-assets-to-local-storage.py` (materialize 441 files into `apps/backend/static`).
2. Ran `python3 scripts/upload-assets-to-local-storage.py --write-seed-inputs` and `--write-manifest` where needed; repaired `fixed` / `fixed2` URL strings.
3. `docker exec -e REAL_DATA_SEED_CONFIRM=1 medusa_backend … medusa exec ./src/scripts/seed-real-data.ts` — loaded **109** products from `seed-products.fixed2.json`, **Image URLs aligned for 109 products**.

## Validation results

### Asset delivery

- Unique URLs collected from `seed-products.fixed2.json` (`main_image_url` + `image_urls`): **441**.
- HEAD checks with path percent-encoding for non-ASCII segments: **441 OK**, **0 failed** (against `http://127.0.0.1:9000`).

### Data integrity (JSON + seed log)

- `fixed2` product count: **109**.
- Handles: `ol-05-n` present; Cyrillic `ol-05-н` absent; `ol-08-1-mirror` present (verified in `seed-products.fixed2.json`).
- Collections / categories / classifications: unchanged by this fix beyond image fields; seed run completed category links and classification pass as before.

### Regression guard

- Greenwich sample URL `…/static/products/greenwich/GR-02-1_gallery_01.jpg`: **HTTP 200**.

## Remaining caveats

- Automated HTTP clients must **percent-encode** path segments when storage keys contain non-ASCII characters (e.g. `OL-05-Н_main.jpg`); browsers and typical clients do this automatically.
- **Binary files** under `apps/backend/static/products/` are **not** committed; reproduce with `upload-assets-to-local-storage.py` after clone.

## Final verdict

**PASS** — real-data assets for the draft subset resolve over `/static/…` in the current Docker/MVP setup, aligned with Medusa’s static middleware and Greenwich, without changing canonical `seed.ts` or the storefront.
