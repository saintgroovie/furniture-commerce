# Visual source inventory and matching report

## Short verdict

**Read-only inventory + matching pass completed.** Yandex/WOODRIGHT white-background roots are **not mounted** on this machine (`source_root_missing`). Local trees under `apps/backend/static/products`, `data/raw/downloaded-assets`, and `data/processed/storefront-assets` were scanned (images only). Legacy `front-manifest.json` rows and `visual-asset-candidate-manifest.json` rows were indexed as references. **No apply**, no DB, no storefront/runtime/catalog-scope changes.

---

## Source roots availability

| Root | Result |
|------|--------|
| `/WOODRIGHT/Контент /Фото на белом фоне` | `source_root_missing` |
| `/Users/leonidmbp/Yandex.Disk/WOODRIGHT/Контент /Фото на белом фоне` | `source_root_missing` |
| `/Users/leonidmbp/Yandex Disk/WOODRIGHT/Контент /Фото на белом фоне` | `source_root_missing` |
| `apps/backend/static/products` | Present — **645** image files |
| `data/raw/downloaded-assets` | Present — **628** image files |
| `data/processed/storefront-assets` | Present — **634** image files |

Missing Yandex roots are recorded as **not a data error** — expected when Disk is not synced/mounted.

---

## Inventory counts (machine index)

See `data/normalized/visual-source-inventory-index.json` → `summary`:

- **Total inventory rows:** 3072  
- **By `source_system`:** `backend_static_existing` 645, `yandex_disk` (local export/cache trees) 1262, `legacy_front` 1150, `normalized_manifest` 15  
- **Legacy front manifest rows:** 1150 (`data/raw/front/front-manifest.json`)  
- **Disk scan truncation:** none (under internal cap)

---

## Matching / candidate map

Artifact: `data/normalized/visual-source-product-candidate-map.json`

- **MVP-anchored candidates:** 6 (aligned with `storefront-mvp-best-available-media-map.json` products)  
- **`blocked_or_ambiguous` rows:** 85 (includes MVP `blocked` rows, capped disk orphans without clear SKU tokens, truncation note if any)  
- **Heuristic rules:** WOODRIGHT refs without local mount → **not safe** for automatic card use until mount/static + ref alignment; Oxford stays **temporary / paused governance**; Monchelsea row stays **probable + human review**.

---

## MVP card use — summary

| Category | Finding |
|----------|---------|
| **White-background (confirmed in planning, path on disk)** | Only when canonical Yandex path exists **or** static + ref aligned; today WOODRIGHT mount **absent** → CO-02-1 primary ref is **identity/reference** only until mount. |
| **Backend static (Oxford pilot)** | Interim PNGs exist and are indexed; suitable **temporary pilot** context, **not** public rollout / unpause. |
| **Legacy / front** | 1150 rows: strong hints for many SKUs; paths mostly `/WOODRIGHT/...` → **reference_only** for executor until mount. |
| **Non-white / gallery on disk** | Country London Paris has **existing** `CO-02-1_*` JPEGs under static (color/gallery family); **not** promoted to replace confirmed white-bg primary in MVP map. |

---

## Blocked / human review / AI backlog

- **Blocked / ambiguous bucket:** see `blocked_or_ambiguous[]` in `visual-source-product-candidate-map.json` (orphan disk files, MVP blocked aggregates, etc.).  
- **Human review:** Monchelsea probable row; any WOODRIGHT-only path while roots missing.  
- **AI backlog:** unchanged from MVP map `ai_generation_backlog` (this pass does not expand AI scope).

---

## CO-02-1 — `co-02-1-blue-i1.jpg`

| Check | Result |
|--------|--------|
| Canonical path on disk | **No** (`local_filesystem_exists: false` in inventory summary) |
| Legacy `front-manifest.json` rows with this **filename** | **1** row (`asset_id` linked in candidate map as `inv_legacy_82e826ee3221`) |
| Controlled static path `apps/backend/static/products/country-london-paris/co-02-1-blue-i1.jpg` | **Not materialized** (separate operator task) |
| Other `CO-02-1` images on disk | Color/gallery JPEGs exist under `country-london-paris/` static — **not** interchangeable with confirmed white-bg primary without governance |

---

## MVP media map changes

`storefront-mvp-best-available-media-map.json`:

- `audit_meta.generated_date` set to **2026-05-02**; new `source_files_checked` entries for inventory artifacts + generator script.  
- **CO-02-1** row only: added `visual_inventory_evidence` (canonical path missing; legacy row count; note on static siblings).  
- **No** change to selected primary ref, `mvp_usage_status`, Oxford/Monchelsea/WW/Oliver rows, or blocked set semantics.

---

## Explicit confirmations

- **No** `yarn mvp-media-assignments -- --apply` / no `MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1` apply.  
- **No** product / metadata / stage / readiness / `catalog-scope.ts` / storefront runtime changes.  
- **No** automatic download of remote URLs.  
- **No** asset copy/rename into production/static in this pass.

---

## Artifacts

| File | Role |
|------|------|
| `data/normalized/visual-source-inventory-index.json` | Full inventory + `summary` |
| `data/normalized/visual-source-product-candidate-map.json` | MVP-anchored candidates + blocked/ambiguous |
| `scripts/build-visual-source-inventory.mjs` | Regenerator (read-only logic) |

---

## Next safe step

Re-run generator after operator mounts Disk or adds files (no commit of binaries required for this script to pick up new paths):

```bash
node scripts/build-visual-source-inventory.mjs
```

Then dry-run executor only (unchanged policy):

```bash
cd apps/backend && yarn mvp-media-assignments
```
