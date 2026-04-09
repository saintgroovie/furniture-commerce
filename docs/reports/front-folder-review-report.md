# Disk Product Photography Review Report

Итоговый отчёт по inventory и matching product photography с Yandex Disk.

---

## Key Discovery

**Папка `/Front` пуста** (0 файлов доступно через API). Реальные product shots находятся в:

```
/WOODRIGHT/Контент /Фото на белом фоне /  — 6 подпапок с white-bg product photos
/WOODRIGHT/Babysecret/Oliver/             — Oliver collection white-bg photos
/WOODRIGHT/Контент /Аксессуары            — Accessories photos
/WOODRIGHT/Контент /Шкафы                 — Wardrobe/cabinet photos
/WOODRIGHT/Контент /Коллекции /Oxford     — Oxford collection photos
/WOODRIGHT/Контент /Размеры              — Dimension diagrams
```

---

## Overview

| Metric | Value |
|--------|-------|
| Folders scanned | **11** |
| Total assets inventoried | **1150** |
| Assets with article codes | **990** (86%) |
| Unique article codes | **381** |
| Matched to workbook | **121** |
| Missing → disk_verified | **4** |
| PDF candidate → disk_verified | **10** |
| Fuzzy → disk_verified | **6** |
| Verified/promoted + preferred disk image | **87** |
| VV blocked → disk_candidate | **15** |

---

## Coverage Progression (Full Pipeline)

| Stage | Hard Matched | Soft Matched | Coverage |
|-------|-------------|-------------|----------|
| After legacy scrape | 125 | 125 | 36.5% |
| + fuzzy promotion | 147 | 147 | 43.0% |
| + PDF fallback | 147 | 189 | 55.3% (soft) |
| **+ disk photography** | **167** | **199** | **48.8% hard / 58.2% soft** |

**Disk added 20 hard-verified products** and provided **87 preferred white-bg replacements** for already-matched items.

---

## Final Image Mapping Status

| Status | Count | % | Description |
|--------|-------|---|------------|
| **verified** | 125 | 36.5% | Legacy code match |
| **promoted** | 22 | 6.4% | Safe fuzzy→verified |
| **disk_verified** | 20 | 5.8% | Clean disk product photo |
| **pdf_candidate** | 32 | 9.4% | PDF catalog image |
| **disk_candidate** | 15 | 4.4% | WW base product on disk |
| **fuzzy** | 52 | 15.2% | Needs manual review |
| **blocked** | 48 | 14.0% | VV decision pending |
| **missing** | 28 | 8.2% | No source found |

---

## Collection Coverage After Disk

| Collection | Total | Hard | Soft | Hard% | All% | Change |
|-----------|-------|------|------|-------|------|--------|
| **oliver** | 71 | 67 | 67 | **94%** | 94% | +5pp |
| **provence** | 35 | 29 | 29 | **83%** | 83% | +6pp |
| **oxford** | 23 | 0 | 18 | 0% | **78%** | +0pp |
| **princess-rose** | 34 | 20 | 23 | **59%** | 68% | +0pp |
| **country-london-paris** | 30 | 13 | 19 | **43%** | 63% | +30pp |
| **greenwich** | 15 | 3 | 8 | **20%** | 53% | +0pp |
| **monchelsea** | 67 | 32 | 32 | **48%** | 48% | +0pp |
| **accessories** | 8 | 3 | 3 | **38%** | 38% | +38pp |
| **willie-winkie** | 59 | 0 | 0 | **0%** | 0% | +0pp |

### Most improved by disk photography

- **Country-London-Paris: 13% → 43% hard** (+30pp, 9 disk-verified products with clean white-bg shots)
- **Accessories: 0% → 38%** (+38pp, 3 accessory items matched from dedicated folder)
- **Provence: 77% → 83%** (+6pp, 2 new disk-verified + 23 preferred upgrades)
- **Oliver: 89% → 94%** (+5pp, 6 new disk-verified + 58 preferred white-bg upgrades)

---

## Preferred White-Background Upgrades

**87 already-matched items** now have higher-quality white-background disk images as `preferred_main_image`:

| Collection | Count | Description |
|-----------|-------|-------------|
| Oliver | 58 | Full white-bg product lineup from Babysecret folder |
| Provence | 23 | Clean product shots |
| Country | 4 | Country/London white-bg photos |
| Monchelsea | 2 | Chair/stool photos from Стулья folder |

These preferred images can replace legacy website thumbnails when building the storefront.

---

## PDF Candidates Upgraded to Disk

10 products that previously only had PDF catalog imagery now have clean disk product shots:

| Code | Product | Source |
|------|---------|--------|
| CO-08-1 | Тумбочка прикроватная | white_bg/country |
| CO-14-2 | Кровать 1 сп. с подъем мех | white_bg/country |
| CO-61-1 | Шкаф книжный со стеклом | white_bg/country |
| CO-62-2 | Стеллаж узкий с дверью | white_bg/country |
| CO-62-3 | Стеллаж узкий с ящиком | white_bg/country |
| CO-65-1 | Стол письменный 1-тумб. | white_bg/country |
| CO-65-2 | Стол письменный 1-тумб. | white_bg/country |
| CO-66-1 | Стол письменный 2-тумб. | white_bg/country |
| OL-21-1 | Стол обеденный раздвижной | Babysecret/Oliver |
| OL-26-2 | Шкаф-витрина | Babysecret/Oliver |

---

## Willie Winkie: 15 Base Products Found

15 WW-coded items (previously blocked) now have `disk_candidate` imagery showing the **base unpainted product**:

- WW-01-1/3, WW-02-1/3, WW-03-1/3 (Шкафы для одежды)
- WW-40-1/3 (Шкаф комбинированный)
- WW-42-1 (Тумба ТВ)
- WW-61-1/3, WW-62-1/3 (Книжные шкафы, стеллажи)
- WW-65-1, WW-66-1 (Столы письменные)

These images show the furniture without VV painting — usable as base product visuals, but VV painting decision still blocks full use.

---

## Naming Patterns That Worked

| Pattern | Example | Matches | Confidence |
|---------|---------|---------|-----------|
| `{code}-i{N}.jpg` | `co-02-1-i1.jpg` | **Most** | 0.9 |
| `{code}-{color}-i{N}.jpg` | `co-02-1-blue-i1.jpg` | Color variants | 0.85 |
| `{code}-{suffix}.jpg` | `a-31-1-los.jpg` | Accessories | 0.8 |
| `MNm-c-{code}.jpg` | `MNm-c-23-1-leona160.jpg` | Monchelsea chairs | 0.85 |

---

## Remaining Unresolved

| Queue | Count | Priority |
|-------|-------|----------|
| VV blocked (no base image) | 48 | Critical (business) |
| Remaining fuzzy | 52 | Medium |
| PDF candidate only | 32 | Medium |
| Still missing | 28 | Low |
| Missing product code | 4 | Low |
| **Total** | **164** | |

### Still missing breakdown

| Category | Count | Items |
|----------|-------|-------|
| Accessories (textiles) | 5 | Подушки, валик, сундук |
| Country detail parts | 6 | Полки в шкаф/стол, столешница пеленальная |
| Country large beds | 2 | Двуспальные 160×200, 180×200 |
| Country other | 2 | Стул, Часы |
| Monchelsea niche | 3 | Обувница, угловые шкафы |
| Oliver special | 2 | Тумбочка для рукоделия, кровать SINGLE |
| Oxford sub-lines | 5 | Мой замок, Милый дом (no catalog), чехол |
| Princess Rose | 2 | Зеркало напольное, кровать-трансформер с тканью |
| Provence | 1 | Часы |

---

## Biggest Risks

1. **Disk images not downloaded** — only metadata inventoried. Download URLs are ephemeral (require API call at fetch time).
2. **VV decision still blocking** — 48 products (including 15 with base images found) remain in limbo.
3. **PDF candidates at lower quality** — 32 products rely on PDF-extracted images that may not be clean enough for storefront.
4. **Fuzzy matches not resolved** — 52 products still have uncertain image associations.
5. **Missing items are genuinely hard** — remaining 28 are detail parts, textiles, and sub-product-lines without catalogs.
6. **Color variants not modeled** — disk has color-specific images (`-blue-`, `-grey-`) but the mapping doesn't track variant-level imagery yet.

---

## Production Readiness Assessment

### Ready for first normalized dataset pass?

**Partially.** For production-quality collections:

| Collection | Ready? | Rationale |
|-----------|--------|-----------|
| Oliver | **Yes** | 94% hard-matched, 58 preferred white-bg images |
| Provence | **Yes** | 83% hard-matched, 23 preferred white-bg images |
| Princess Rose | **Nearly** | 59% hard, needs fuzzy review for remaining 9 |
| Monchelsea | **No** | 48% hard, 28 fuzzy unresolved |
| Country-London-Paris | **No** | 43% hard, many detail parts missing |
| Greenwich | **No** | 20% hard, mostly fuzzy/PDF |
| Oxford | **No** | 0% hard (all PDF candidate), needs manual review |
| Willie Winkie | **No** | Business decision pending |
| Accessories | **No** | 38% hard, textiles missing |

---

## Recommended Next Step

### Manual review of high-impact items (highest ROI now)

1. **Review 32 PDF candidates** — visually confirm if PDF-extracted images are usable
2. **Review 52 fuzzy matches** — confirm/reject with visual comparison (20 have PDF cross-reference)
3. **Download preferred disk images** for Oliver (58) and Provence (23) — start building storefront assets
4. **VV painting business decision** — unlocks 48+ products

### What this pipeline has accomplished

From **0% image coverage** to:
- **167 hard-matched** products (48.8%) with confirmed imagery
- **87 items** with preferred white-background alternatives
- **32 additional** items with PDF candidate imagery
- **15 WW items** with base product images ready for use after VV decision
- **1150 disk assets** inventoried with article codes for future use

---

## Created Files

**Documentation:**
- `docs/content/front-folder-review-strategy.md`
- `docs/reports/front-folder-review-report.md`

**Scripts:**
- `scripts/build-front-manifest.py`
- `scripts/match-front-assets.py`

**Data:**
- `data/raw/front/front-manifest.json` (1150 assets)
- `data/raw/front/front-manifest-summary.json`
- `data/raw/front/front-manifest-warnings.json` (133 warnings)
- `data/normalized/image-map.after-front.json` (342 entries)
- `data/normalized/front-review.json` (121 match entries)
- `data/normalized/unresolved-image-matches.after-front.json`

---

## Architectural Safety Confirmed

- No backend code modified
- No storefront code modified
- No seed.ts updated
- No data imported into Medusa
- All disk images marked as `disk_verified` or `disk_candidate` — clearly separated from legacy/PDF sources
- VV blocked items not auto-resolved — only base product images noted
- Preferred disk images stored separately from existing main_image assignments
- All sources (legacy, PDF, disk) remain distinguishable in final mapping
