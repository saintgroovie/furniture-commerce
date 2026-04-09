# Production Dataset Inclusion Rules

Правила включения/исключения товаров из first production-minded normalized dataset.

---

## Included Statuses

| Status | Inclusion | Rationale |
|--------|-----------|-----------|
| `verified` | **Yes** | Confirmed article code match from legacy site |
| `promoted` | **Yes** | Fuzzy match safely promoted via documented rules |
| `disk_verified` | **Yes** | Article code match from disk white-bg product photos |
| Manually confirmed `pdf_candidate` | **Yes** (after review) | PDF catalog image confirmed by human reviewer |
| Manually confirmed `fuzzy` | **Yes** (after review) | Legacy fuzzy match confirmed by human reviewer |

## Excluded Statuses

| Status | Inclusion | Rationale |
|--------|-----------|-----------|
| `blocked` | **No** | VV painting business decision pending |
| `disk_candidate` | **No** | VV base image found but VV decision blocks use |
| Unconfirmed `pdf_candidate` | **No** | PDF image not yet human-verified |
| Unconfirmed `fuzzy` | **No** | Legacy match not yet confirmed |
| `missing` | **No** | No image source available |
| Items without `product_code_normalized` | **No** | Cannot map to backend product |

---

## Data Completeness Requirements

A product qualifies for the production subset when ALL conditions are met:

1. `product_code_normalized` is present and non-empty
2. `mapping_status` is in `{verified, promoted, disk_verified}` or manually confirmed
3. At least one image source is available (`main_image` or `preferred_main_image`)
4. `price_normalized` is available from workbook
5. `dimensions_normalized` is available from workbook (except accessories)

---

## Preferred Image Source Priority

When building the final storefront asset set:

| Priority | Source | Field | When to use |
|----------|--------|-------|-------------|
| 1 | Disk white-bg | `preferred_main_image` | Always preferred if present |
| 2 | Disk verified | `main_image` (type=white_bg) | When no preferred override |
| 3 | Legacy verified | `main_image` (type=legacy) | When no disk image available |
| 4 | PDF confirmed | `main_image` (type=pdf_embedded) | Only after manual confirmation |

### Gallery Images

Gallery images follow the same priority. If `preferred_gallery` exists, it replaces `gallery_images`.

---

## Ephemeral URLs vs Production Assets

### What is NOT production-ready

- `source_ref` values pointing to Yandex Disk paths (e.g., `/WOODRIGHT/Контент /...`)
  — These are metadata references, not stable download URLs
- Legacy site URLs (e.g., `https://woodright.ru/...`)
  — The site is unstable, URLs may break
- Local file paths to PDF-extracted images (e.g., `data/raw/pdf-assets/extracted/...`)
  — These are development artifacts, not CDN assets

### What IS required before production

1. **Download** — fetch actual image files using Yandex Disk API download endpoint
2. **Preprocess** — resize, optimize, convert to web format (WebP/JPEG)
3. **Upload** — place in Medusa-compatible storage (S3, local media, etc.)
4. **Stable URL** — replace `source_ref` with final production URL
5. **Seed reference** — only then include in seed.ts with confirmed image URLs

---

## Promotion Path for Excluded Items

### PDF candidates (32 items)

```
pdf_candidate → [manual review] → confirmed_pdf → included
                                → rejected → stays excluded
```

### Fuzzy matches (52 items)

```
fuzzy → [manual review] → confirmed_fuzzy → included
                        → rejected → stays excluded
```

### VV blocked (48 items)

```
blocked → [business decision] → unblocked → re-enter matching pipeline
                               → confirmed_vv → include with painting-specific images
```

### Missing (28 items)

```
missing → [manual source] → manually_assigned → included
        → [deferred] → stays excluded (first pass)
```

---

## What Must Happen Before seed.ts

| Step | Status | Blocks seed.ts? |
|------|--------|----------------|
| Production subset identified | **Done** (167 items) | No |
| Manual review of PDF/fuzzy | **Not done** | Yes, for those items |
| Download preferred disk images | **Not done** | Yes |
| Preprocess images for web | **Not done** | Yes |
| Upload to production storage | **Not done** | Yes |
| Generate stable image URLs | **Not done** | Yes |
| VV business decision | **Not done** | Yes, for 48+ items |
| Map normalized data to Medusa entities | **Not done** | Yes |
| Write seed.ts with confirmed data | **Not done** | — |

The 167-item production subset is the **starting point**, not the end.
