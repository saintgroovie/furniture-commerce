# Greenwich Next Actions

Actionable recommendations based on completed scrape, mapping, and review analysis.

---

## Production-Ready Items (13 of 15)

These Greenwich products have sufficient imagery and confirmed mappings:

| Code | Name | Status | Main Source | Confidence | Gallery |
|------|------|--------|------------|------------|---------|
| GR-05-1 | Комод | verified | legacy_site | 0.80 | 15 images |
| GR-26-1 | Шкаф-витрина Кристалл | verified | legacy_site | 0.85 | 24 images |
| GR-44-1 | Консоль | verified | legacy_site | 0.80 | 19 images |
| GR-67-1 | Рабочий стол | verified | legacy_site | 0.80 | 20 images |
| GR-02-1 | Гардероб 2-дв. с ящиками | high_confidence | pdf_embedded | 0.75 | legacy gallery available |
| GR-02-2 | Гардероб 2-дв. | high_confidence | legacy_site | 0.75 | 21 images |
| GR-08-1 | Тумба с 2 ящиками | high_confidence | pdf_embedded | 0.75 | legacy gallery available |
| GR-08-2 | Тумба с 1 ящиком | high_confidence | pdf_embedded | 0.75 | legacy gallery available |
| GR-09-1 | Кровать 1-сп. (90×200) | resolved_shared_visual_pool | legacy_site | 0.75 | 23 shared pool |
| GR-12-1 | Кровать 1,5-сп. (120×200) | resolved_shared_visual_pool | legacy_site | 0.75 | 23 shared pool |
| GR-14-1 | Кровать 1,5-сп. (140×200) | resolved_shared_visual_pool | legacy_site | 0.75 | 23 shared pool |
| GR-16-1 | Кровать 2-сп. (160×200) | resolved_shared_visual_pool | legacy_site | 0.75 | 23 shared pool |
| GR-18-1 | Кровать 2-сп. (180×200) | resolved_shared_visual_pool | legacy_site | 0.75 | 23 shared pool |

**Action:** 8 items already downloaded. 5 beds downloaded separately via bed imagery pool pass.

---

## Greenwich Beds — RESOLVED (2026-03-19)

**Business decision confirmed:** Frame/Cloud/Plane are headboard design variants (not separate products). Each workbook bed row represents a mattress size; any headboard design can be ordered in any size.

**Resolution:**
- All 5 bed rows unblocked from `fuzzy` → `resolved_shared_visual_pool`
- 23-image shared pool from 3 design families (Frame: 8, Cloud: 8, Plane: 7) assigned to all beds
- Frame main image used as representative main for all size entries
- Product identity remains workbook-driven; design-family imagery is presentation-layer only

---

## Temporary PDF Fallback (2 of 15)

| Code | Name | PDF Source | Resolution | Adequate? |
|------|------|-----------|------------|-----------|
| GR-09-1 | Зеркало навесное | Greenwich_p11 | 1509×970 | Yes, temporary |
| GR-42-1 | Тумба ТВ | Greenwich_p7 | 1531×1360 | Yes, temporary |

**Action:** Accept PDF images as temporary placeholders. These products have no legacy presence. Before launch, they need production photography or high-res catalog scans.

---

## Duplicate Code Handling

**Affected code:** GR-09-1 (used for both Зеркало навесное and Кровать 1-сп.)

**Rule until resolved:**
- Always use compound key: `workbook_row_key` + `canonical_name`
- Never assign assets by `product_code_normalized` alone for Greenwich
- Flag to business for code deduplication

---

## Is Greenwich Ready for Asset Download Pass?

**Yes — 13 of 15 items are production-ready.** Breakdown:

| Tier | Items | Ready? |
|------|-------|--------|
| Production-ready imagery | 8 items | Downloaded |
| Beds (confirmed design-family pool) | 5 items | Downloaded — shared pool |
| PDF temporary | 2 items | Copied locally as temp |

**All downloadable assets have been fetched.** Only GR-09-1 (mirror) and GR-42-1 (TV stand) remain as PDF temporary — they need production photography before launch.

---

## Before Greenwich Enters Production-Minded Subset

Checklist:

- [x] Legacy scrape completed (11/11 pages, 188 images)
- [x] Workbook mapping completed (15/15 items mapped)
- [x] Source priority logic applied (PDF > low-confidence legacy)
- [x] Provenance tracked for every extracted image
- [x] Duplicate code GR-09-1 documented and safe-keyed
- [x] Review queue created for unresolved items
- [x] **Manual confirmation:** beds are design-agnostic — **CONFIRMED 2026-03-19**
- [x] **Asset download:** 8 ready items downloaded (170 files, 63 MB)
- [x] **Bed imagery download:** 5 beds unblocked, shared pool downloaded (23 images)
- [x] **PDF acceptance:** GR-09-1 mirror and GR-42-1 copied as temporary
- [ ] **Quality check:** verify downloaded images are product shots, not interior scenes
- [ ] **Code dedup:** raise GR-09-1 duplicate with business team

---

## Recommended Execution Order

1. ~~Download legacy images for 8 production-ready items~~ — **Done**
2. ~~Accept PDF images for GR-09-1 (mirror) and GR-42-1 as temporary~~ — **Done**
3. ~~Ask single question about bed design variants~~ — **Confirmed 2026-03-19**
4. ~~Upgrade 5 bed entries, download bed imagery pool~~ — **Done**
5. **Before launch:** Commission production photography for PDF-only items
6. **Deferred:** Resolve GR-09-1 code duplication with business

---

## Files Reference

| File | Purpose |
|------|---------|
| `docs/collections/greenwich/greenwich-unresolved-review.md` | Detailed review of each unresolved category |
| `data/normalized/greenwich-unresolved-review.json` | Structured review workbench |
| `data/normalized/greenwich-image-map.json` | Full Greenwich image mapping |
| `data/normalized/greenwich-review-queue.json` | Fuzzy items only |
| `data/raw/legacy/greenwich-products.json` | Raw scraped data |
| `docs/collections/greenwich/greenwich-legacy-image-report.md` | Scrape summary report |
