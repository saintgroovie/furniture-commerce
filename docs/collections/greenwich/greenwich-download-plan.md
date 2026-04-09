# Greenwich Asset Download Plan

Controlled download pass for Greenwich production-ready subset.

---

## Scope

| Category | Items | Action |
|----------|-------|--------|
| Production-ready (legacy + PDF main) | 8 | Download all main + gallery images |
| PDF-only temporary | 2 | Copy local PDF images as temp fallback |
| Beds (blocked) | 5 | Excluded — awaiting design-family confirmation |

**Total manifest entries:** 170
**URLs to fetch from legacy site:** 165
**Local PDF copies:** 5

---

## Included Items

### Tier 1 — Verified (legacy main, download all)

| Code | Name | Main Source | Gallery Count |
|------|------|-----------|---------------|
| GR-05-1 | Комод | legacy: `greenwich_capuchino04.jpg` | 15 |
| GR-26-1 | Шкаф-витрина Кристалл | legacy: `greenwich_capuchino19.jpg` | 24 |
| GR-44-1 | Консоль | legacy: `greenwich_green07_d5hh-4j.jpg` | 19 |
| GR-67-1 | Рабочий стол | legacy: `greenwich_capuchino16.jpg` | 20 |

### Tier 2 — High Confidence (PDF main + legacy gallery, download all)

| Code | Name | Main Source | Gallery Count |
|------|------|-----------|---------------|
| GR-02-1 | Гардероб 2-дв. с ящиками | PDF: `Greenwich_p5_i1_1498x967.png` | 21 |
| GR-02-2 | Гардероб 2-дв. | legacy: `greenwich_white25_sldj-a6.jpg` | 19 |
| GR-08-1 | Тумба с 2 ящиками | PDF: `Greenwich_p9_i0_1536x970.png` | 20 |
| GR-08-2 | Тумба с 1 ящиком | PDF: `Greenwich_p10_i0_1764x1143.png` | 20 |

### Tier 3 — PDF Temporary (local copy only, no gallery)

| Code | Name | PDF Source | Status |
|------|------|-----------|--------|
| GR-09-1 | Зеркало навесное | `Greenwich_p11_i0_1509x970.png` | temporary_pdf |
| GR-42-1 | Тумба ТВ | `Greenwich_p7_i2_1531x1360.png` | temporary_pdf |

---

## Excluded Items

### Beds — Blocked by design-family decision

| Code | Name | Blocker |
|------|------|---------|
| GR-09-1 | Кровать 1-сп. (90×200) | Frame/Cloud/Plane mapping unresolved |
| GR-12-1 | Кровать 1,5-сп. (120×200) | Frame/Cloud/Plane mapping unresolved |
| GR-14-1 | Кровать 1,5-сп. (140×200) | Frame/Cloud/Plane mapping unresolved |
| GR-16-1 | Кровать 2-сп. (160×200) | Frame/Cloud/Plane mapping unresolved |
| GR-18-1 | Кровать 2-сп. (180×200) | Frame/Cloud/Plane mapping unresolved |

These will be included in a **separate download pass** after the bed design-family question is confirmed.

---

## Download Configuration

- **Target directory:** `data/raw/downloaded-assets/greenwich/`
- **Naming:** `{CODE}_{ROLE}_{INDEX}.{ext}` (e.g., `GR-05-1_main_01.jpg`, `GR-05-1_gallery_03.jpg`)
- **Legacy site fetch:** Retry 3× with 5s backoff, timeout 30s per request
- **PDF local copies:** Simple file copy from `data/raw/pdf-assets/extracted/Greenwich/`
- **Dedup by GR-09-1:** Mirror gets `GR-09-1_main_01.png` — compound key prevents confusion with bed entry

---

## Download Script

`scripts/greenwich-download-assets.py` reads `greenwich-download-manifest.json` and:
1. Creates target directory
2. For `copy_local` actions: copies PDF file to target path
3. For `fetch_url` actions: downloads from legacy site with retry logic
4. Updates each manifest entry with `download_status` (success/failed/skipped)
5. Writes `greenwich-download-result.json` with final counts

---

## Post-Download Verification

After download:
- [ ] Verify file count matches manifest (170 expected)
- [ ] Spot-check image quality for main images
- [ ] Confirm no broken/truncated downloads (file size > 1KB)
- [ ] Confirm PDF copies are valid PNG files
- [ ] No bed images downloaded (5 beds × all gallery = 0 files)

---

## Files

| File | Purpose |
|------|---------|
| `data/processed/asset-manifests/greenwich-download-manifest.json` | Full manifest (170 entries) |
| `data/processed/asset-manifests/greenwich-download-summary.json` | Stats summary |
| `scripts/greenwich-download-manifest.py` | Manifest generator |
| `scripts/greenwich-download-assets.py` | Download executor |
