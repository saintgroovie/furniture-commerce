# Disk Download Readiness Report

Отчёт о готовности к скачиванию preferred disk images для confirmed production subset.

---

## Executive Summary

**435 файлов** из 4 приоритетных коллекций готовы к скачиванию по manifest.
**102 продукта** покрыты disk-фотографиями (из 167 в production subset).
**0 naming collisions** — каждый файл имеет уникальное target имя.
Estimated download size: **~130 MB**.

---

## Oliver: 67 products in subset

| Metric | Value |
|--------|-------|
| Products with disk images | 63 / 67 (94%) |
| Preferred main images | 57 |
| Gallery images | 119 |
| Color variant images | 120 |
| Total files to download | **279** |
| Est. size | ~84 MB |

### Oliver — 3 products rely on legacy images only

| Code | Product | Image source |
|------|---------|-------------|
| OL-00-1 | Шкаф угловой (руч.лев/пр) | legacy_site |
| OL-05-Н | Комод высокий (ниже на 1 ярус ящиков) | legacy_site |
| OL-08-2 | Тумбочка прикроватная с дверкой | legacy_site |

### Oliver — 4 products excluded from subset

| Code | Product | Exclusion reason |
|------|---------|-----------------|
| OL-08-Н | Тумбочка для рукоделия | no_image_source |
| OL-14-3 | Кровать 1-сп. (90×190) с подъемн.мех SI | no_image_source |
| OL-15-3 | Кровать 1,5-сп. (120×190) с подъемн.мех | fuzzy_unconfirmed |
| OL-16-3 | Кровать 1,5-сп. (140×190) с подъемн.мех | fuzzy_unconfirmed |

**Oliver блокеров для download нет.** 63 из 67 products покрыты disk images, 3 имеют legacy fallback. Download можно начинать.

---

## Provence: 29 products in subset

| Metric | Value |
|--------|-------|
| Products with disk images | 25 / 29 (86%) |
| Preferred main images | 23 |
| Gallery images | 43 |
| Color variant images | 0 |
| Total files to download | **66** |
| Est. size | ~20 MB |

### Provence — 4 products rely on legacy images only

| Code | Product | Image source |
|------|---------|-------------|
| PV-14-1 | Кровать 1-сп. (90×190) без изножья | legacy_site |
| PV-16-1 | Кровать 1,5-сп. (140×190) без изножья | legacy_site |
| PV-17-1 | Кровать 2-сп. (160×200) без изножья | legacy_site |
| PV-68-1 | Этажерка малая 3 полки | legacy_site |

### Provence — 6 products excluded from subset

| Code | Product | Exclusion reason |
|------|---------|-----------------|
| PV-08-3 | Тумбочка прикроватная с 2 ящиками | fuzzy_unconfirmed |
| PV-14-2 | Кровать 1-сп. (90×190) с тканью без изножья | fuzzy_unconfirmed |
| PV-16-2 | Кровать 1,5-сп. (140×190) с тканью | fuzzy_unconfirmed |
| PV-17-2 | Кровать 2-сп. (160×200) с тканью | fuzzy_unconfirmed |
| PV-18-2 | Кровать 2-сп. (180×200) с тканью | fuzzy_unconfirmed |
| PV-30-1 | Часы | no_image_source |

**Provence блокеров нет.** 25 из 29 products покрыты disk images.

---

## Country-London-Paris & Monchelsea (bonus)

| Collection | Products | Files | Main | Gallery | Color |
|-----------|----------|-------|------|---------|-------|
| Country-London-Paris | 13 | 89 | 2 | 37 | 50 |
| Monchelsea | 1 | 1 | 1 | 0 | 0 |

Включены в manifest для completeness, но основной фокус — Oliver + Provence.

---

## Download Manifest Summary

| Collection | Products | Files | Est. MB |
|-----------|----------|-------|---------|
| Oliver | 63 | 279 | ~84 |
| Provence | 25 | 66 | ~20 |
| Country | 13 | 89 | ~27 |
| Monchelsea | 1 | 1 | ~0.3 |
| **Total** | **102** | **435** | **~131** |

---

## Gallery Depth

| Collection | Avg images/product | Max | Min |
|-----------|-------------------|-----|-----|
| Oliver | 4.4 | 26 (OL-23-1, color variants) | 1 |
| Provence | 2.6 | 5 | 1 |

Oliver OL-23-1 has 26 images due to multiple color variants (leona, lillian, etc.).

---

## Next Collections After Oliver + Provence

| Priority | Collection | Disk assets | Production items | Gap |
|----------|-----------|-------------|-----------------|-----|
| 3 | Country-London-Paris | 113 | 13 (43%) | PDF review could add ~10 |
| 4 | Monchelsea | 17 | 32 (48%) | Many fuzzy, limited disk |
| 5 | Princess Rose | 8 | 20 (59%) | Mostly legacy, little disk |
| 6 | Accessories | 62 | 3 (38%) | Many unmatched disk assets |
| — | Greenwich | 7 | 3 (20%) | Almost entirely needs review |
| — | Oxford | 7 | 0 (0%) | Blocked — needs PDF review |
| — | Willie Winkie | 441 | 0 (0%) | Blocked — VV business decision |

---

## Proximity to First Real Content Ingestion

### What's ready now
- 167 products identified as production subset
- 435 disk images mapped with download manifest
- 0 naming collisions
- All 167 products have price, dimensions, category

### What must happen before seed.ts

| Step | Status | Estimate |
|------|--------|----------|
| Download 435 disk images | **Manifest ready** | ~1 hour (script + validation) |
| Download legacy fallback images | Not started | ~30 min |
| Preprocess for web (resize/optimize) | Not started | ~2 hours (script) |
| Upload to production storage | Not started | Depends on infrastructure |
| Map to Medusa entities | Not started | ~4 hours |
| Write seed.ts | Not started | ~4 hours |

**Estimated total: 1-2 working days** from download to first seed-ready dataset for Oliver + Provence.

### What expands the subset (optional, not blocking)
- Review 32 PDF candidates → +20 products (estimated)
- Review 52 fuzzy matches → +25 products (estimated)
- VV business decision → +48-63 products

---

## Remaining Blockers for Oliver + Provence Download

**None.** Both collections are ready for immediate download:
- Download manifest is built
- Target filenames are collision-free
- Source refs are verified against front manifest (86/86 match)

The only items requiring separate handling are:
- 7 legacy-only products (3 Oliver + 4 Provence) — need legacy image download separately
- 10 excluded products (4 Oliver + 6 Provence) — pending review or missing

---

## Files Created in This Task

| File | Purpose |
|------|---------|
| `docs/assets/disk-asset-preprocess-strategy.md` | Download/preprocess strategy |
| `docs/reports/assets/disk-download-readiness-report.md` | This report |
| `scripts/prepare-disk-asset-manifest.py` | Manifest builder script |
| `data/processed/asset-manifests/disk-download-manifest.json` | 435 files to download |
| `data/processed/asset-manifests/disk-download-summary.json` | Download summary stats |

## Recommended Next Step

**Запустить download для Oliver (279 файлов, ~84 MB)**:
1. Создать `scripts/download-disk-assets.py` с retry + validation
2. Скачать в `data/raw/downloaded-assets/oliver/`
3. Валидировать (PIL.Image.verify, size check, hash)
4. Записать `download-log.json`
5. Повторить для Provence (66 файлов, ~20 MB)
