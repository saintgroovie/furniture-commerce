# Greenwich Unresolved Items Review

Review document for Greenwich items requiring manual decisions before production readiness.

---

## 1. Greenwich Beds — Unresolved Mapping

### The Problem

The workbook defines **5 bed entries by mattress width**:

| Code | Name | Width | Price |
|------|------|-------|-------|
| GR-09-1 | Кровать 1-сп. (90×200) | 1030mm | 71 900₽ |
| GR-12-1 | Кровать 1,5-сп. (120×200) | 1330mm | 81 100₽ |
| GR-14-1 | Кровать 1,5-сп. (140×200) | 1530mm | 89 700₽ |
| GR-16-1 | Кровать 2-сп. (160×200) | 1730mm | 94 000₽ |
| GR-18-1 | Кровать 2-сп. (180×200) | 1930mm | 110 400₽ |

The legacy site defines **3 bed products by headboard design**:

| Legacy Name | URL | Main Image Pattern | Gallery Count |
|-------------|-----|--------------------|---------------|
| Кровать Frame | `/kollekcii/greenwich/krovat-frame/` | `greenwich_frame_*` | 8 |
| Кровать Cloud | `/kollekcii/greenwich/krovat-cloud/` | `greenwich_cloud_*` | 8 |
| Кровать Plane | `/kollekcii/greenwich/krovat-plane/` | `greenwich_plane_*` | 7 |

### Why They Don't Map 1:1

- **Workbook dimension = mattress width.** The workbook organizes beds by size (90, 120, 140, 160, 180cm).
- **Legacy site dimension = headboard design.** Frame, Cloud, and Plane are three distinct headboard styles.
- Each headboard design is available in **all** mattress sizes. The bed frame is identical; only the headboard panel differs.
- Therefore: **5 sizes × 3 designs = 15 possible combinations**, but the workbook lists only 5 entries (size-based, design-agnostic).

### Evidence from Image Filenames

**Frame** — minimalist rectangular headboard:
- `greenwich_frame_natural_beige.jpg` / `greenwich_frame_dark_beige.jpg`
- `greenwich_fame_natural_darkblue.jpg` / `greenwich_fame_dark_darkblue.jpg`
- 3× render views (`noliver_var2_View01/02/03.jpg`)
- 1× sizes diagram (`sizes10.webp`)

**Cloud** — upholstered/soft headboard:
- `greenwich_cloud_natural_beige.jpg` / `greenwich_cloud_dark_beige.jpg` / `greenwich_cloud_dark_darkblue.jpg`
- 4× interior/bedroom shots (`bedroom2_int_View01/04.jpg`, date-stamped photos)
- 1× sizes diagram (`sizes12.jpg`)

**Plane** — wide horizontal headboard:
- `greenwich_plane_natural_beige.jpg` / `greenwich_plane_dark_beige.jpg`
- `greenwich_plane_natural_darkblue.jpg` / `greenwich_plane_dark_darkblue.jpg`
- 2× wide render views (`greenwich_wideheader_View01/02`)
- 1× sizes diagram (`sizes11.webp`)

### PDF Evidence

The existing `image-map.after-front.json` has PDF assignments:
- GR-09-1 (bed) mapped to PDF page 11 — labeled "Зеркало Frame" (this is a PDF mapping error; page 11 is the mirror page)
- GR-12-1 through GR-18-1 mapped to PDF page 9 — labeled "Кровать Cloud"

This confirms PDF catalog page 9 shows **Cloud** as one bed design, but doesn't resolve which workbook sizes correspond to which designs.

### Resolution Strategy

**Option A — Design-agnostic (RECOMMENDED for MVP):**
All 5 workbook bed entries represent the same bed frame in different sizes. Headboard design (Frame/Cloud/Plane) is a **variant choice**, not a separate product. For asset purposes:
- Assign **one design** (e.g., Frame — most product shots) as main image for all 5 size entries
- Include images from all 3 designs as gallery images
- Flag that headboard design is a variant axis not captured in current workbook structure

**Option B — Map specific designs to specific sizes:**
This would require explicit business input (e.g., "90cm beds default to Frame, 160cm to Cloud"). No evidence supports this mapping.

**Recommendation:** Use Option A. All beds get the same design-family imagery pool. Main image = Frame (most neutral product shots). Cloud and Plane images go to gallery. This is safe and accurate — no false claims about which design a specific size entry represents.

### Decision — RESOLVED (2026-03-19)

**Business confirmed:** Frame/Cloud/Plane are headboard design variants of the same bed frame, available in all 5 mattress sizes. They are NOT separate product lines.

- [x] Confirm that Frame/Cloud/Plane are headboard variants, not separate product lines — **CONFIRMED**
- [x] Choose default headboard design for main product image — **Frame** (most neutral product shots)
- [ ] Decide if headboard design becomes a product variant in the storefront data model later — **Deferred**

**Resolution applied:**
- All 5 bed rows unblocked
- `mapping_status` upgraded to `resolved_shared_visual_pool` (confidence 0.75)
- Shared imagery pool from all 3 designs (Frame/Cloud/Plane = 23 images) assigned to all bed entries
- Product identity remains workbook-driven (size-based), imagery is presentation-layer only
- Bed download pass executed separately from the 8 ready items

---

## 2. Duplicate Code: GR-09-1

### The Situation

Code `GR-09-1` appears **twice** in the ГРИНВИЧ workbook sheet:

| Row | Code | Name | Category | Dimensions | Price |
|-----|------|------|----------|-----------|-------|
| 6 | GR-09-1 | Зеркало навесное | Зеркала | 1000×650×30mm | 28 400₽ |
| 16 | GR-09-1 | Кровать 1-сп. (90×200) | Кровати | 1050×1030×2207mm | 71 900₽ |

These are completely different products (mirror vs bed) sharing the same article code.

### Impact on Mapping

1. **`workbook_row_key`** uses format `greenwich:GR-09-1` — this is **not unique** for these two items
2. Any lookup by `product_code_normalized` alone will return ambiguous results
3. The existing `image-map.after-front.json` contains two separate entries with the same `workbook_row_key`
4. The PDF catalog page 11 shows "Зеркало Frame" — this is the **mirror**, not the bed

### Safe Temporary Keying Strategy

To avoid asset confusion:

1. **Primary key:** Use `workbook_row_key` + `canonical_name` as compound identifier
   - `greenwich:GR-09-1` + `Зеркало навесное` → the mirror
   - `greenwich:GR-09-1` + `Кровать 1-сп. (90*200)` → the bed

2. **Alternative:** Use `workbook_row_key` + `row_index`
   - `greenwich:GR-09-1:row6` → mirror
   - `greenwich:GR-09-1:row16` → bed

3. **product_code alone is INSUFFICIENT** for unique asset assignment in Greenwich

### Root Cause

This is likely a **data entry error** in the workbook. GR-09 prefix is used for "Зеркало" in other Woodright collections (09 = зеркала), and separately the bed at 90cm width also gets suffix 09 (from the mattress width). Two different numbering conventions collide.

### Recommendation

- [ ] Flag to business: is GR-09-1 code intentionally shared, or should one product get a different code?
- [ ] Until resolved, always use compound key (code + name) for asset assignment
- [ ] Do not merge or deduplicate these entries

---

## 3. PDF-Only Items

### GR-09-1 — Зеркало навесное

| Field | Value |
|-------|-------|
| PDF source | `Greenwich.pdf` page 11 |
| PDF product name | Зеркало Frame |
| PDF image | `Greenwich_p11_i0_1509x970.png` |
| PDF image resolution | 1509×970 — adequate for web |
| Legacy page | **None** — no mirror product on legacy Greenwich pages |
| Disk source | Not found |

**Assessment:** PDF image is the **only** available source. Resolution is adequate for temporary use. The mirror is named "Зеркало Frame" in the catalog, suggesting it matches the "Frame" headboard design family.

### GR-42-1 — Тумба ТВ

| Field | Value |
|-------|-------|
| PDF source | `Greenwich.pdf` page 7 |
| PDF product name | Тумба ТВ Wide |
| PDF image | `Greenwich_p7_i2_1531x1360.png` |
| PDF image resolution | 1531×1360 — good for web |
| Legacy page | **None** — no TV stand on legacy Greenwich pages |
| Disk source | Not found |

**Assessment:** PDF image is adequate. Named "Тумба ТВ Wide" in catalog — matches workbook "Тумба ТВ" with high confidence. No legacy imagery exists for this product.

### Recommendation for Both

- Accept PDF images as **temporary main images** (status: `pdf_candidate`, confidence: 0.7)
- No further legacy search needed — these products simply aren't on the legacy site
- Mark as requiring **production-quality photography** before launch
- Do not promote to `verified` without proper product shots

---

## 4. Items Where Legacy Is Only Fallback

These items have legacy imagery matched but at low confidence:

| Code | Name | Legacy Match | Confidence | Issue |
|------|------|-------------|------------|-------|
| GR-09-1 | Кровать 1-сп. | Кровать Frame | 0.50 | Bed type match only |
| GR-12-1 | Кровать 1,5-сп. | Кровать Frame | 0.50 | Bed type match only |
| GR-14-1 | Кровать 1,5-сп. | Кровать Frame | 0.50 | Bed type match only |
| GR-16-1 | Кровать 2-сп. | Кровать Frame | 0.50 | Bed type match only |
| GR-18-1 | Кровать 2-сп. | Кровать Frame | 0.50 | Bed type match only |

All 5 currently point to `Кровать Frame` as fallback. Per the bed analysis above, this is **structurally correct** — Frame is one valid design for any of these sizes. But:

- Confidence 0.50 means "generic type match, not specific product match"
- All 5 entries share the same fallback images — not differentiated
- If confirmed as design-agnostic (Option A), confidence can be raised to 0.75 for all beds

### What Changes With Manual Confirmation

If a reviewer confirms that Greenwich beds are sold by size with headboard as a variant:
1. All 5 beds can use Frame as main image (confidence → 0.75)
2. Cloud and Plane images added as gallery (interior/alternative views)
3. Status changes from `fuzzy` to `confirmed_design_family`
4. The bed entries become production-usable

---

## Summary Table

| Code | Name | Status | Blocker | Action Needed |
|------|------|--------|---------|--------------|
| GR-02-1 | Гардероб 2-дв. с ящиками | high_confidence | None | Ready with PDF+legacy |
| GR-02-2 | Гардероб 2-дв. | high_confidence | None | Ready with legacy |
| GR-05-1 | Комод | verified | None | Ready |
| GR-08-1 | Тумба с 2 ящиками | high_confidence | None | Ready with PDF+legacy |
| GR-08-2 | Тумба с 1 ящиком | high_confidence | None | Ready with PDF+legacy |
| GR-09-1 | Зеркало навесное | pdf_candidate | No legacy/disk source | Accept PDF as temp |
| GR-09-1 | Кровать 1-сп. | resolved_shared_visual_pool | None | Unblocked — shared bed pool |
| GR-12-1 | Кровать 1,5-сп. (120) | resolved_shared_visual_pool | None | Unblocked — shared bed pool |
| GR-14-1 | Кровать 1,5-сп. (140) | resolved_shared_visual_pool | None | Unblocked — shared bed pool |
| GR-16-1 | Кровать 2-сп. (160) | resolved_shared_visual_pool | None | Unblocked — shared bed pool |
| GR-18-1 | Кровать 2-сп. (180) | resolved_shared_visual_pool | None | Unblocked — shared bed pool |
| GR-26-1 | Шкаф-витрина Кристалл | verified | None | Ready |
| GR-42-1 | Тумба ТВ | pdf_candidate | No legacy source | Accept PDF as temp |
| GR-44-1 | Консоль | verified | None | Ready |
| GR-67-1 | Рабочий стол | verified | None | Ready |
