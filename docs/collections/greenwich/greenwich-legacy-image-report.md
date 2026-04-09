# Greenwich Legacy Image Report

Generated: 2026-03-19 00:51

---

## Summary

| Metric | Count |
|--------|-------|
| Greenwich products in workbook | 15 |
| Greenwich product pages on legacy site | 11 |
| Successfully scraped detail pages | 11 |
| Main images extracted | 11 |
| Gallery images extracted (additional) | 177 |
| Total unique images extracted | 188 |

---

## Matching Results

| Status | Count | Description |
|--------|-------|-------------|
| Verified / High confidence | 8 | Reliable match to workbook row |
| Fuzzy | 5 | Needs manual review |
| Missing / Low confidence | 0 | No reliable image source |

---

## Source Decisions

| Decision | Count | Meaning |
|----------|-------|---------|
| Legacy as preferred main | 5 | Legacy image is main product shot |
| Legacy as gallery/fallback only | 5 | Better source exists for main |
| Disk source preferred | 0 | Disk white-bg image already better |
| PDF only | 0 | Only PDF-extracted image available |

---

## Greenwich Workbook Coverage

| Code | Name | Match Status | Confidence | Source Decision |
|------|------|-------------|------------|----------------|
| GR-02-1 | Гардероб 2 -х дв.  с ящиками | high_confidence | 0.75 | pdf_preferred_low_legacy_confidence |
| GR-02-2 | Гардероб 2-дв. | high_confidence | 0.75 | legacy_preferred |
| GR-05-1 | Комод | verified | 0.80 | legacy_preferred |
| GR-08-1 | Прикроватная тумба с 2 ящиками | high_confidence | 0.75 | pdf_preferred_low_legacy_confidence |
| GR-08-2 | Прикроватная тумба с 1 ящиком | high_confidence | 0.75 | pdf_preferred_low_legacy_confidence |
| GR-09-1 | Зеркало навесное | pdf_candidate | 0.00 | pdf_preferred_low_legacy_confidence |
| GR-09-1 | Кровать  1-сп. (90*200) | fuzzy | 0.50 | legacy_fallback |
| GR-12-1 | Кровать  1,5-сп. (120*200) | fuzzy | 0.50 | legacy_fallback |
| GR-14-1 | Кровать  1,5-сп. (140*200) | fuzzy | 0.50 | legacy_fallback |
| GR-16-1 | Кровать  2-сп. (160*200) | fuzzy | 0.50 | legacy_fallback |
| GR-18-1 | Кровать  2-сп. (180*200) | fuzzy | 0.50 | legacy_fallback |
| GR-26-1 | Шкаф-витрина Кристалл | verified | 0.85 | legacy_preferred |
| GR-42-1 | Тумба ТВ | pdf_candidate | 0.00 | pdf_preferred_low_legacy_confidence |
| GR-44-1 | Консоль | verified | 0.80 | legacy_preferred |
| GR-67-1 | Рабочий стол | verified | 0.80 | legacy_preferred |

---

## Greenwich Legacy Scrape Coverage

| # | Legacy Title | URL | Main Image | Gallery Count |
|---|-------------|-----|-----------|---------------|
| 1 | Комод Scale | `/kollekcii/greenwich/komod-scale-ru-16/` | ✓ | 15 |
| 2 | Кровать Frame | `/kollekcii/greenwich/krovat-frame/` | ✓ | 7 |
| 3 | Кровать Cloud | `/kollekcii/greenwich/krovat-cloud/` | ✓ | 7 |
| 4 | Кровать Plane | `/kollekcii/greenwich/krovat-plane/` | ✓ | 6 |
| 5 | Шкаф-витрина Cristal | `/kollekcii/greenwich/shkaf-vitrina-cristal/` | ✓ | 24 |
| 6 | Консоль Step | `/kollekcii/greenwich/konsol-step/` | ✓ | 19 |
| 7 | Рабочий стол Base | `/kollekcii/greenwich/rabochiy-stol-base/` | ✓ | 20 |
| 8 | Прикроватная тумба Hole | `/kollekcii/greenwich/prikrovatnaya-tumba-hole/` | ✓ | 19 |
| 9 | Прикроватная тумба Stone | `/kollekcii/greenwich/prikrovatnaya-tumba-stone/` | ✓ | 20 |
| 10 | Гардероб Level | `/kollekcii/greenwich/garderob-level/` | ✓ | 21 |
| 11 | Гардероб Total | `/kollekcii/greenwich/garderob-total/` | ✓ | 19 |

---

## Preferred vs Fallback Source Decisions

- **GR-09-1** (Зеркало навесное): pdf_preferred_low_legacy_confidence — PDF image preferred; legacy confidence too low for main
- **GR-05-1** (Комод): legacy_preferred — High-confidence legacy match (exact_canonical_name_within_greenwich); Legacy image used as main
- **GR-44-1** (Консоль): legacy_preferred — High-confidence legacy match (exact_canonical_name_within_greenwich); Legacy image used as main
- **GR-67-1** (Рабочий стол): legacy_preferred — High-confidence legacy match (exact_canonical_name_within_greenwich); Legacy image used as main
- **GR-42-1** (Тумба ТВ): pdf_preferred_low_legacy_confidence — PDF image preferred; legacy confidence too low for main
- **GR-08-1** (Прикроватная тумба с 2 ящиками): pdf_preferred_low_legacy_confidence — Good match (manual_greenwich_mapping) — near verified; PDF image preferred; legacy confidence too low for main
- **GR-08-2** (Прикроватная тумба с 1 ящиком): pdf_preferred_low_legacy_confidence — Good match (manual_greenwich_mapping) — near verified; PDF image preferred; legacy confidence too low for main
- **GR-26-1** (Шкаф-витрина Кристалл): legacy_preferred — High-confidence legacy match (abbreviation_match); Legacy image used as main
- **GR-02-1** (Гардероб 2 -х дв.  с ящиками): pdf_preferred_low_legacy_confidence — Good match (manual_greenwich_mapping) — near verified; PDF image preferred; legacy confidence too low for main
- **GR-02-2** (Гардероб 2-дв.): legacy_preferred — Good match (manual_greenwich_mapping) — near verified; Legacy image used as main
- **GR-09-1** (Кровать  1-сп. (90*200)): legacy_fallback — Legacy match is fuzzy (greenwich_bed_type_match) — needs manual review; Legacy image used as fallback (low confidence)
- **GR-12-1** (Кровать  1,5-сп. (120*200)): legacy_fallback — Legacy match is fuzzy (greenwich_bed_type_match) — needs manual review; Legacy image used as fallback (low confidence)
- **GR-14-1** (Кровать  1,5-сп. (140*200)): legacy_fallback — Legacy match is fuzzy (greenwich_bed_type_match) — needs manual review; Legacy image used as fallback (low confidence)
- **GR-16-1** (Кровать  2-сп. (160*200)): legacy_fallback — Legacy match is fuzzy (greenwich_bed_type_match) — needs manual review; Legacy image used as fallback (low confidence)
- **GR-18-1** (Кровать  2-сп. (180*200)): legacy_fallback — Legacy match is fuzzy (greenwich_bed_type_match) — needs manual review; Legacy image used as fallback (low confidence)

---

## Remaining Unresolved Greenwich Items

- **GR-09-1** (Кровать  1-сп. (90*200)): status=fuzzy, confidence=0.50, basis=greenwich_bed_type_match
- **GR-12-1** (Кровать  1,5-сп. (120*200)): status=fuzzy, confidence=0.50, basis=greenwich_bed_type_match
- **GR-14-1** (Кровать  1,5-сп. (140*200)): status=fuzzy, confidence=0.50, basis=greenwich_bed_type_match
- **GR-16-1** (Кровать  2-сп. (160*200)): status=fuzzy, confidence=0.50, basis=greenwich_bed_type_match
- **GR-18-1** (Кровать  2-сп. (180*200)): status=fuzzy, confidence=0.50, basis=greenwich_bed_type_match

---

## Scrape Warnings

- `https://woodright.ru/kollekcii/greenwich/komod-scale-ru-16/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/krovat-frame/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/krovat-cloud/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/krovat-plane/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/shkaf-vitrina-cristal/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/konsol-step/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/rabochiy-stol-base/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/prikrovatnaya-tumba-hole/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/prikrovatnaya-tumba-stone/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/garderob-level/`: no_code_in_filename
- `https://woodright.ru/kollekcii/greenwich/garderob-total/`: no_code_in_filename

---

## Recommended Next Steps

1. **Manual review** of fuzzy matches in `data/normalized/greenwich-review-queue.json`
2. **Verify bed mappings**: Greenwich beds (Frame/Cloud/Plane) are design variants, not size variants — confirm which bed design maps to which workbook size entry
3. **Check if disk images exist** for GR-09-1 (Зеркало навесное) and GR-42-1 (Тумба ТВ) which have no legacy match
4. **Download preferred legacy images** to local storage for items where legacy is the selected main source
5. **Do not replace** any confirmed disk white-background image with a legacy interior shot

---

## Created Files

- `data/raw/legacy/greenwich-products.json` — raw scraped Greenwich data
- `data/raw/legacy/greenwich-products-summary.json` — scrape summary
- `data/raw/legacy/greenwich-scrape-warnings.json` — scrape warnings
- `data/normalized/greenwich-image-map.json` — Greenwich image mapping
- `data/normalized/greenwich-review-queue.json` — items needing review
- `docs/collections/greenwich/greenwich-legacy-image-report.md` — this report
