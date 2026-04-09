# Greenwich Bed Resolution Report

Generated: 2026-03-19

---

## Business Decision

**Confirmed:** Greenwich beds in the workbook are differentiated by mattress size (90, 120, 140, 160, 180 cm). Frame, Cloud, and Plane on the legacy site are headboard design variants of the same bed frame, available in all sizes.

**Consequence:**
- 5 blocked bed rows are now unblocked
- Frame/Cloud/Plane imagery is a shared visual pool for all bed sizes
- No separate product identities for design families
- Product identity remains workbook-driven

---

## Unblocked Bed Rows

| Code | Name | Previous Status | New Status | Confidence |
|------|------|----------------|------------|------------|
| GR-09-1 | Кровать 1-сп. (90×200) | fuzzy (0.50) | resolved_shared_visual_pool | 0.75 |
| GR-12-1 | Кровать 1,5-сп. (120×200) | fuzzy (0.50) | resolved_shared_visual_pool | 0.75 |
| GR-14-1 | Кровать 1,5-сп. (140×200) | fuzzy (0.50) | resolved_shared_visual_pool | 0.75 |
| GR-16-1 | Кровать 2-сп. (160×200) | fuzzy (0.50) | resolved_shared_visual_pool | 0.75 |
| GR-18-1 | Кровать 2-сп. (180×200) | fuzzy (0.50) | resolved_shared_visual_pool | 0.75 |

**Note:** GR-09-1 is a duplicate code (also used for Зеркало навесное). Compound key `(workbook_row_key, canonical_name)` is always used to distinguish the bed from the mirror.

---

## Shared Imagery Pool

### Pool Structure

| Design Family | Legacy Page | Images | Main Candidate |
|---------------|-----------|--------|----------------|
| Frame | `/kollekcii/greenwich/krovat-frame/` | 8 | `greenwich_frame_natural_beige.jpg` |
| Cloud | `/kollekcii/greenwich/krovat-cloud/` | 8 | `greenwich_cloud_natural_beige.jpg` |
| Plane | `/kollekcii/greenwich/krovat-plane/` | 7 | `greenwich_plane_natural_beige.jpg` |
| **Total** | | **23** | 3 main candidates |

### Main Image Selection

`greenwich_frame_natural_beige.jpg` (Frame design) selected as representative main image for all 5 bed entries. Rationale: most neutral product shots, clean background, consistent with other Greenwich product imagery.

### How the Pool Is Modeled

- Each of the 5 bed entries in `greenwich-image-map.json` has:
  - `main_image`: Frame design main shot (confidence 0.75)
  - `gallery_images`: all 23 images from all 3 design families
  - `mapping_status`: `resolved_shared_visual_pool`
  - `match_basis`: `confirmed_design_family_pool`
- Gallery images include `design_family` tag (frame/cloud/plane) for storefront filtering
- Images are shared — 5 workbook rows reference the same 23-image pool
- No duplication of product identity; size entries remain distinct

---

## Download Manifest

| Metric | Value |
|--------|-------|
| Manifest file | `data/processed/asset-manifests/greenwich-bed-download-manifest.json` |
| Total entries | 23 |
| Frame images | 8 |
| Cloud images | 8 |
| Plane images | 7 |
| Target directory | `data/raw/downloaded-assets/greenwich/beds/` |
| Naming convention | `GR-BED-POOL_{design}_{index}.{ext}` |

---

## Download Execution

| Metric | Value |
|--------|-------|
| Result file | `data/processed/asset-manifests/greenwich-bed-download-result.json` |
| Success | 23 |
| Failed | 0 |
| Skipped | 0 |
| Total size | 4.28 MB |

All 23 files downloaded successfully. Files stored in dedicated `beds/` subfolder, separate from the 8 ready items' assets.

---

## Updated Greenwich Readiness

### Before This Resolution

| Tier | Items | Status |
|------|-------|--------|
| Production-ready | 8 | Downloaded |
| Beds (blocked) | 5 | Awaiting business decision |
| PDF temporary | 2 | Copied locally |

### After This Resolution

| Tier | Items | Status |
|------|-------|--------|
| Production-ready | 13 | Downloaded |
| PDF temporary | 2 | Copied locally (temp) |

**Greenwich collection: 13 of 15 items (87%) are now production-ready with downloaded imagery.**

---

## Remaining Items

| Code | Name | Status | Issue |
|------|------|--------|-------|
| GR-09-1 | Зеркало навесное | temporary_pdf | No legacy/disk source; PDF 1509×970 used as temp |
| GR-42-1 | Тумба ТВ | temporary_pdf | No legacy source; PDF 1531×1360 used as temp |

These 2 items need production photography before launch. No further scraping or automation can resolve them — the products simply don't exist on the legacy site.

---

## Duplicate Code GR-09-1 — Still Active

The duplicate code issue persists after this resolution:
- GR-09-1 (Зеркало навесное, row 6) — PDF temporary, mirror product
- GR-09-1 (Кровать 1-сп., row 16) — resolved shared pool, bed product

**Safeguard:** All scripts and manifests use compound key `(workbook_row_key, canonical_name)`. The bed download manifest references `workbook_row_keys` as array of all 5 bed entries, avoiding GR-09-1 ambiguity.

**Pending:** Business team should assign a unique code to either the mirror or the bed.

---

## Files Created/Updated

| File | Action | Purpose |
|------|--------|---------|
| `docs/collections/greenwich/greenwich-unresolved-review.md` | Updated | Marked beds as resolved |
| `docs/collections/greenwich/greenwich-next-actions.md` | Updated | Reflects 13/15 readiness |
| `data/normalized/greenwich-image-map.json` | Updated | 5 bed entries upgraded |
| `data/processed/asset-manifests/greenwich-bed-download-manifest.json` | Created | 23-entry bed pool manifest |
| `data/processed/asset-manifests/greenwich-bed-download-summary.json` | Created | Pool statistics |
| `data/processed/asset-manifests/greenwich-bed-download-result.json` | Created | Download execution results |
| `scripts/greenwich-bed-resolve.py` | Created | Image map updater + manifest generator |
| `scripts/greenwich-bed-download-assets.py` | Created | Bed pool downloader |
| `docs/collections/greenwich/greenwich-bed-resolution-report.md` | Created | This report |
