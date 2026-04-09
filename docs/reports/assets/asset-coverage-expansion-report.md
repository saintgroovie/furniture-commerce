# Asset Coverage Expansion Report

Отчёт о расширении processed asset layer на Country-London-Paris + legacy fallback.

---

## Executive Summary

**3 коллекции достигли 100% покрытия**: Oliver (67/67), Provence (29/29), Country-London-Paris (13/13).
Общее покрытие production subset: **109/167 (65%)**.
441 processed files, 20.2 MB total.

---

## Country-London-Paris Disk Assets

### Download

| Metric | Value |
|--------|-------|
| Planned | 89 files |
| Downloaded | 89 |
| Failed | 0 |
| Size | 26.6 MB |
| Duration | ~4 min |

### Preprocess

| Metric | Value |
|--------|-------|
| Processed | 88 |
| Dedup copies | 1 |
| Failed | 0 |
| Raw → Processed | 26.6 MB → 3.0 MB (11%) |

### Coverage

| Product | Files | Roles |
|---------|-------|-------|
| CO-02-1 | 9 | main + 8 color (blue, grey, white) |
| CO-05-1 | 8 | main + 7 color |
| CO-08-1 | 8 | 8 gallery |
| CO-14-2 | 2 | 2 gallery |
| CO-15-2 | 6 | main + 1 gallery + 4 color |
| CO-61-1 | 9 | 2 gallery + 7 color |
| CO-62-1 | 10 | main + 4 gallery + 5 color |
| CO-62-2 | 4 | 4 gallery |
| CO-62-3 | 2 | 2 gallery |
| CO-65-1 | 10 | 3 gallery + 7 color |
| CO-65-2 | 8 | 1 gallery + 7 color |
| CO-66-1 | 8 | 1 gallery + 7 color |
| CO-69-1 | 5 | 5 gallery |

**Result:** 13/13 CLP products fully covered. Rich color variant imagery for many items (blue/grey/white options).

---

## Oliver/Provence Legacy Fallback

### Results

| Code | Collection | Name | Dimensions | Source |
|------|-----------|------|-----------|--------|
| OL-00-1 | oliver | Шкаф угловой | 820×820 | Legacy site |
| OL-05-Н | oliver | Комод высокий | 1200×1200 | Legacy site |
| OL-08-2 | oliver | Тумбочка с дверкой | 1200×1200 | Legacy site |
| PV-14-1 | provence | Кровать 1-сп. без изножья | 522×532 | Legacy screenshot |
| PV-16-1 | provence | Кровать 1,5-сп. без изножья | 1200×1200 | Legacy site |
| PV-17-1 | provence | Кровать 2-сп. без изножья | 1200×1200 | Legacy site |
| PV-68-1 | provence | Этажерка малая 3 полки | 225×287 | Legacy screenshot |

### Quality Notes

- 5/7 images at full resolution (≥820px) — adequate for web
- **PV-14-1** (522×532) — low resolution, screenshot quality
- **PV-68-1** (225×287) — very low resolution, barely usable; needs reshoot before launch

---

## Updated Coverage by Collection

| Collection | Before | After | Delta | Status |
|-----------|--------|-------|-------|--------|
| Oliver | 64/67 | **67/67** | +3 | **100%** |
| Provence | 25/29 | **29/29** | +4 | **100%** |
| Country-London-Paris | 0/13 | **13/13** | +13 | **100%** |
| Monchelsea | 0/32 | 0/32 | — | 0% |
| Princess Rose | 0/20 | 0/20 | — | 0% |
| Greenwich | 0/3 | 0/3 | — | 0% |
| Accessories | 0/3 | 0/3 | — | 0% |
| **Total** | **89/167** | **109/167** | **+20** | **65%** |

---

## Processed Asset Totals

| Metric | Value |
|--------|-------|
| Total processed files | 441 |
| Total size on disk | 20.2 MB |
| Products with main image | 72 |
| Products with gallery/color | 95 |
| Unique products covered | 109 |

### By Role

| Role | Count |
|------|-------|
| gallery | 199 |
| color_variant | 170 |
| main | 72 |

---

## Still Without Processed Assets (58 items)

| Collection | Remaining | Notes |
|-----------|-----------|-------|
| Monchelsea | 32 | Minimal disk assets (1 file in manifest) |
| Princess Rose | 20 | 8 disk assets available, mostly legacy |
| Accessories | 3 | Dedicated disk folder exists (62 files) |
| Greenwich | 3 | Production-ready items (GR-05-1, GR-26-1, etc.) |

These 58 items need either legacy fallback downloads or different sourcing approach.

---

## Files Created / Updated

| File | Purpose |
|------|---------|
| `docs/assets/asset-coverage-expansion-plan.md` | Expansion scope and plan |
| `docs/reports/assets/asset-coverage-expansion-report.md` | This report |
| `scripts/download-legacy-fallback.py` | Legacy fallback download + preprocess |
| `data/raw/downloaded-assets/country-london-paris/` | 89 raw CLP images |
| `data/raw/downloaded-assets/legacy/oliver/` | 3 raw legacy Oliver images |
| `data/raw/downloaded-assets/legacy/provence/` | 4 raw legacy Provence images |
| `data/processed/storefront-assets/country-london-paris/` | 89 processed CLP images |
| `data/processed/asset-manifests/processed-assets.json` | 434 records (Oliver+Provence+CLP) |
| `data/processed/asset-manifests/legacy-fallback-manifest.json` | 7 legacy fallback items |
| `data/processed/asset-manifests/legacy-fallback-summary.json` | Legacy processing results |

---

## Recommended Next Step

1. **Build asset-to-product binding layer** — connect processed assets to Medusa entity model
2. **Expand to Monchelsea/Princess Rose** — legacy fallback for remaining 52 items
3. **Reshoot PV-14-1 and PV-68-1** — low-resolution legacy screenshots need replacement
