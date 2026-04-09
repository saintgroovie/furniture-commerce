# Production Subset Readiness Report

Итоговый отчёт о готовности первого production-minded normalized dataset.

---

## Executive Summary

**167 из 342 товаров** (48.8%) уже квалифицируются для first production subset.
Все 167 имеют полный набор данных: артикул, цена, размеры, подтверждённый источник изображения.

87 из 167 included items (52%) имеют white-background disk фотографии — наилучший визуальный источник.

---

## Production Subset: 167 Items

### By Collection

| Collection | Included | Total | Coverage | Disk Preferred | Best source |
|-----------|----------|-------|----------|----------------|-------------|
| Oliver | 67 | 71 | **94%** | 58 | Disk white-bg |
| Provence | 29 | 35 | **83%** | 23 | Disk white-bg |
| Monchelsea | 32 | 67 | 48% | 2 | Legacy + some disk |
| Princess Rose | 20 | 34 | 59% | 0 | Legacy verified |
| Country-London-Paris | 13 | 30 | 43% | 4 | Mixed legacy/disk |
| Accessories | 3 | 8 | 38% | 0 | Legacy verified |
| Greenwich | 3 | 15 | 20% | 0 | Legacy verified |
| **Oxford** | **0** | **23** | **0%** | 0 | — |
| **Willie Winkie** | **0** | **59** | **0%** | 0 | — |

### Data Completeness (167 included)

| Metric | Count | % |
|--------|-------|---|
| Has image source | 167 | 100% |
| Has price | 167 | 100% |
| Has dimensions | 167 | 100% |
| Has disk white-bg preferred | 87 | 52% |
| Has category | 167 | 100% |

---

## Excluded: 175 Items

| Reason | Count | Resolution path |
|--------|-------|----------------|
| Fuzzy unconfirmed | 52 | Manual review → confirm/reject |
| VV painting decision pending | 48 | Business decision required |
| PDF unconfirmed | 32 | Manual review → confirm/reject |
| No image source | 28 | Manual sourcing or defer |
| VV base image only | 15 | Included in VV decision scope |

---

## Unresolved Review Queues

### Queue 1: PDF Candidates (32 items)

Collections affected: Country (10), Oxford (14), Greenwich (5), Provence (2), Accessories (1)

**Action:** Open PDF page images in `data/raw/pdf-assets/pages/`, confirm product identity.
**Expected yield:** ~20-25 confirmations (estimated ~75% success rate based on match quality).

### Queue 2: Fuzzy Matches (52 items)

Collections affected: Monchelsea (18), Country (10), Princess Rose (7), Greenwich (6), Provence (4), Accessories (4), Oxford (3)

**Action:** Compare legacy site images with workbook product names. 20 have PDF cross-reference.
**Expected yield:** ~25-30 confirmations (estimated ~50% success rate).

### Queue 3: Missing Products (28 items)

Collections affected: Oxford (6), Greenwich (6), Country (5), Monchelsea (4), Accessories (4), Princess Rose (3)

**Action:** Attempt manual sourcing, or mark as deferred for first production pass.
**Expected yield:** ~5-10 manual finds.

---

## Coverage Progression

| Stage | Hard-matched | % |
|-------|-------------|---|
| After legacy scrape | 125 | 36.5% |
| After fuzzy promotion | 147 | 43.0% |
| After PDF fallback | 157 | 45.9% |
| After disk photography | **167** | **48.8%** |
| After PDF review (est.) | ~187 | ~55% |
| After fuzzy review (est.) | ~212 | ~62% |
| After VV decision (est.) | ~260 | ~76% |
| Full catalog (theoretical) | 342 | 100% |

---

## Collections Production Readiness

### Ready for first production pass

- **Oliver** (94%) — 67/71 products, 58 with disk white-bg, most complete collection
- **Provence** (83%) — 29/35 products, 23 with disk white-bg
- **Princess Rose** (59%) — 20/34 products, legacy images

### Partial — worth including but gaps remain

- **Monchelsea** (48%) — 32/67 products, many fuzzy candidates in review
- **Country-London-Paris** (43%) — 13/30 products, PDF candidates could add ~10

### Not ready

- **Greenwich** (20%) — only 3/15 confirmed, needs review
- **Accessories** (38%) — only 3/8, small but gaps
- **Oxford** (0%) — entirely PDF candidates and missing, blocks on review
- **Willie Winkie** (0%) — entirely blocked by VV business decision

---

## What Must Happen Before seed.ts

| # | Step | Status | Blocks seed? |
|---|------|--------|-------------|
| 1 | Production subset identified | **Done** (167) | No |
| 2 | Inclusion rules documented | **Done** | No |
| 3 | Review queues prepared | **Done** (112 items) | No |
| 4 | Manual review of PDF/fuzzy | **Not started** | Partially (for those items) |
| 5 | Download preferred disk images | **Not started** | **Yes** |
| 6 | Preprocess images for web | **Not started** | **Yes** |
| 7 | Upload to production storage | **Not started** | **Yes** |
| 8 | Map to Medusa product entities | **Not started** | **Yes** |
| 9 | VV painting business decision | **Not started** | For 63 items |
| 10 | Write seed.ts | **Not started** | — |

Steps 5-7 are the critical path for the 167-item subset.
Steps 4 and 9 expand the subset but don't block the first pass.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Disk white-bg URLs are ephemeral | Images lost if not downloaded | Download script planned, high priority |
| Legacy site goes down permanently | 80 items lose image source | Download legacy images as backup |
| PDF image quality too low | Some products visually poor | Accept for MVP, flag for reshoot |
| VV decision never made | 59 products permanently blocked | Ship without WW collection initially |
| Oxford remains at 0% | Entire collection missing | PDF review is the only path |

---

## Recommended Next Steps

### Immediate (highest ROI)

1. **Download Oliver & Provence disk images** — 87 preferred images, stable the most complete collections
2. **Review 32 PDF candidates** — could unlock Oxford and expand Country
3. **Review 52 fuzzy matches** — could add ~25 more products

### Soon

4. **Download Country & Monchelsea disk images** — complete available sets
5. **Build image preprocessing pipeline** — resize, optimize, generate WebP
6. **Set up production storage** — S3 bucket or Medusa uploads folder

### Before seed.ts

7. **Map normalized data to Medusa entities** — products, variants, collections
8. **Generate seed.ts** — using production-subset-skeleton.json as source
9. **VV business decision** — unlocks Willie Winkie (59 items)

---

## Files Created in This Task

| File | Purpose |
|------|---------|
| `docs/assets/final-asset-review-plan.md` | Manual review process guide |
| `docs/guidelines/production-dataset-inclusion-rules.md` | Inclusion/exclusion criteria |
| `docs/assets/preferred-asset-download-plan.md` | Download and preprocessing plan |
| `docs/production-subset-readiness-report.md` | This report |
| `data/normalized/review-queue-pdf-candidates.json` | 32 PDF items for review |
| `data/normalized/review-queue-fuzzy.json` | 52 fuzzy items for review |
| `data/normalized/review-queue-missing.json` | 28 missing items for sourcing |
| `data/normalized/production-subset-skeleton.json` | 167 ready products |
| `data/normalized/excluded-from-production-subset.json` | 175 excluded products |
