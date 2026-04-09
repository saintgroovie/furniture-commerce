# Asset Mapping Strategy

Стратегия инвентаризации и маппинга визуальных ассетов для Woodright storefront.

---

## Asset Buckets

Ассеты распределены по 6 источникам-бакетам:

| Bucket | Source | Est. Count | Quality | Auto-Mappable |
|--------|--------|------------|---------|---------------|
| **legacy_product** | woodright.ru product pages | ~300+ | High (pro photos) | Medium — needs scrape |
| **legacy_room** | woodright.ru room pages | ~20–40 | High (interiors) | Low — manual |
| **legacy_collection_hero** | woodright.ru collection pages | ~20 | High | Low — manual |
| **disk_pdf_catalog** | Yandex Disk `/Каталоги/` | 31 PDFs | High (print-ready) | Low — PDF extraction |
| **disk_front** | Yandex Disk `/Front/` | 19 JPGs | Medium (front views) | Low — unknown codes |
| **disk_content** | Yandex Disk `/Контент/` | Unknown | Mixed | Low |

---

## Source Priority by Asset Task

| Task | Priority 1 | Priority 2 | Priority 3 |
|------|-----------|-----------|-----------|
| **Product main image** | Legacy site product page | PDF catalog extracted | Front folder |
| **Product gallery** | Legacy site (multiple angles) | PDF catalog | — |
| **Interior / room image** | Legacy site room pages | Corporate brochure PDF | Disk `/Контент/` |
| **Collection hero** | Legacy site collection page | PDF catalog cover page | — |
| **Color swatches** | Disk `/Front/Цвета по коллекциям.xlsx` | Legacy site | — |
| **Logo** | Legacy site | Disk `/WOODRIGHT/` | — |
| **Dimension diagrams** | Disk `/Контент/Размеры/` | — | — |

---

## Asset Kind Taxonomy

| Kind | Description | Use In Storefront |
|------|-------------|-------------------|
| `product_main` | Primary product shot (white bg or styled) | Product card thumbnail, PDP hero |
| `product_alt` | Additional angle / variant / detail | PDP gallery |
| `interior` | Product in a room context | Room sets, hero sections, lifestyle |
| `room` | Composed room shot (multiple products) | Room set pages |
| `catalog_page` | Full PDF catalog page | Reference only, not direct use |
| `color_swatch` | Material/finish sample | Variant selector |
| `logo` | Brand logo | Header, footer |
| `diagram` | Dimension schematic | PDP details tab |
| `unknown` | Unclassified asset | Review queue |

---

## Distinguishing Asset Kinds

### Product-main vs Interior

- **Product-main:** Single product is the subject. White/neutral background or isolated in frame. Product fills >50% of the image.
- **Interior:** Room scene with furniture arranged. Multiple products visible. Contextual props (rug, lamp, curtains).
- **Rule:** If image shows a composed room — it is `interior` or `room`, never `product_main`.
- **Risk:** Legacy site may use interior shots as product cards. Do NOT auto-promote interior shots to `product_main`.

### Verified vs Fuzzy Match

| Status | Criteria | Action |
|--------|----------|--------|
| `verified` | Exact article code match between workbook and image filename/URL | Auto-assign |
| `fuzzy` | Name or collection match but no code confirmation | Assign with `review_needed` flag |
| `missing` | No image found in any source | Placeholder in storefront |
| `blocked` | Decision depends on business input (e.g., VV painting tier) | Hold in queue |

### Temporary vs Final imagery

- Assets from legacy site and Yandex Disk are **temporary** until art-directed.
- Do NOT mark any sourced image as `final` without explicit approval.
- All sourced images carry status `inferred` until verified by human.

---

## Front Folder Files (Yandex Disk)

The `/Front/` folder contains 19 JPGs with opaque internal codes:

```
f398.jpg, g396.jpg, h356.jpg, h393.jpg, j453.jpg,
k427.jpg, m477.jpg, s444.jpg, G503-pvw.jpg, L386.jpg,
R765-pvs.jpg, R765-mn-big.jpg, f405.jpg, f464.jpg,
mn-color-1.jpg, mn-color-2.jpg, mn-color-2-big.jpg,
mn-color-3-big.jpg, mn-color-3.jpg
```

**Rules:**
- `mn-color-*` files → color swatches for Monchelsea. Kind: `color_swatch`. Collection: `monchelsea`.
- `R765-mn-*` → likely Monchelsea product. Kind: `product_main` (tentative). Collection: `monchelsea` (tentative).
- Remaining codes (f398, g396, etc.) → **unknown internal codes**. Cannot map to workbook articles automatically.
- **Do NOT guess product assignments.** Mark as `unmapped_front_image` and queue for manual review.

---

## PDF Catalogs

31 PDFs in `/Каталоги/` — each corresponds to a workbook collection or VV painting.

**Extraction approach:**
1. Download PDF.
2. Extract pages as images (poppler/pdf2image).
3. Each page becomes a `catalog_page` asset linked to collection.
4. Manual review assigns specific pages to products.
5. Some pages contain multiple products — these become `interior` or `room` assets.

**Do NOT auto-assign PDF pages to products.** The mapping is page→collection only at this stage.

---

## Legacy Site Images

**Collection and collection page images** are accessible at known URLs:
- `/kollekcii/` — collection listing
- `/predmety/{category}/` — product category pages
- Individual product pages — contain main image + gallery

**Scraping rules:**
- Use collection page to build inventory of product URLs per collection.
- For each product page, extract: main image URL, gallery image URLs, product title.
- Match by title to workbook row → `fuzzy` match.
- Match by article if displayed on page → `verified` match.
- Legacy site is slow/unstable — implement retries and caching.

---

## Source Mixing Prevention

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|---------------|------------------|
| Use interior shot as product_main | Misleading product representation | Only use isolated product shots |
| Assign legacy price alongside legacy image | Price may be outdated | Images from legacy, prices from workbook only |
| Treat folder name as product name | Folder structure ≠ storefront taxonomy | Use workbook names as canonical |
| Mix VV painting images across tiers | Each painting is visually distinct | VV images must be painting-specific |
| Mark disk asset as verified without evidence | "Available" ≠ "correctly mapped" | All disk assets start as `inferred` |
