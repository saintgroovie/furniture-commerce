# Legacy Scrape Strategy

Стратегия скрапинга product imagery с https://woodright.ru/

---

## Site Architecture (CS-Cart)

| Layer | URL Pattern | Content |
|-------|-------------|---------|
| Catalog root | `/catalog/` | Category + collection links |
| Category listing | `/predmety/{slug}/` | Product cards, paginated |
| Collection listing | `/kollekcii/{slug}/` | Product cards for one collection |
| Product detail | `/kollekcii/{collection}/{product-slug}/` | Full product page + gallery |
| VV painting product | `/{painting-name}/{product-slug}/` | VV variant product page |

---

## Pages to Scrape

### Phase 1: Category listing pages (primary entry point)

14 categories, each paginated:

| Category | URL | Est. Products |
|----------|-----|---------------|
| Банкетки и скамьи | `/predmety/banketki-i-skami/` | ~10 |
| Детали | `/predmety/interiernye-kartiny/` | ~20 |
| Детские кроватки | `/predmety/detskie-krovatki/` | ~10 |
| Диваны | `/predmety/divany/` | ~5 |
| Комоды | `/predmety/komody/` | ~15 |
| Кресла | `/predmety/kresla/` | ~5 |
| Кровати | `/predmety/krovati/` | ~20 |
| Полки | `/predmety/polki/` | ~15 |
| Прочее | `/predmety/decor/` | ~10 |
| Стеллажи | `/predmety/stellazhi/` | ~10 |
| Столы и столики | `/predmety/stoly-i-stoliki/` | ~20 |
| Стулья, табуретки | `/predmety/stulya-taburetki/` | ~10 |
| Тумбы | `/predmety/tumby/` | ~20 |
| Шкафы | `/predmety/shkafy/` | ~30 |

Pagination: `?page=N` (step=items_per_page, typically 16).

### Phase 2: Product detail pages

For each product URL found in listings, fetch the detail page for gallery images.

---

## HTML Extraction Patterns

### Category listing page

```
Product card: <div class="ut2-gl__item col">
Product link: <a class="product-title" href="{url}" title="{name}">{name}</a>
Thumbnail:   <img src="https://woodright.ru/images/thumbnails/285/285/detailed/{folder}/{file}">
High-res:    <img src="https://woodright.ru/images/thumbnails/570/570/detailed/{folder}/{file}">
```

### Product detail page

```
Title:       <h1><bdi>{name}</bdi></h1>
<title>:     Коллекции :: {Collection} :: {Name} - Woodright ...
Gallery:     <a href="https://woodright.ru/images/detailed/{folder}/{file}"> (lightbox)
Related:     <a class="product-title" href="{url}" title="{name}"> (cross-sell)
```

### Image filename → Article code

Many filenames encode the article code:
- `ol-14-1-lillian-140.jpg` → `OL-14-1`
- `mn-18-1-i1.jpg` → `MN-18-1`
- `gr-09-1-something.jpg` → `GR-09-1`
- `greenwich_cloud_natural_beige.jpg` → name-based (no code)

Pattern: `{prefix}-{num1}-{num2}[-suffix].{ext}` where prefix ∈ {ol, gr, mn, pr, ox, ww, co, fa, ...}

---

## Collection Hint Extraction

From product URL:
- `/kollekcii/oliver/...` → collection: `oliver`
- `/kollekcii/greenwich/...` → collection: `greenwich`
- `/kollekcii/monchelsea/...` → collection: `monchelsea`
- `/fairies/...` → collection: `willie-winkie` (VV painting)
- `/sweet-home/...` → collection: `willie-winkie` (VV painting)

From `<title>` tag:
- `Коллекции :: Oliver :: Product Name` → collection: `oliver`

---

## Site Instability Handling

- Requests take 6–15 seconds from local machine
- WebFetch from remote server: mostly timeouts
- curl from local machine works reliably

### Retry strategy

1. Timeout: 30 seconds per request
2. Max retries: 3 per URL
3. Backoff: 5s, 10s, 20s between retries
4. Polite delay: 3 seconds between successful requests
5. Cache: save raw HTML to `data/raw/legacy/cache/` for rerunning without re-fetching

### Failure modes

| Failure | Handling |
|---------|----------|
| Timeout (no response in 30s) | Retry up to 3 times, then mark `failed` |
| HTTP 404 | Mark as `not_found`, do not retry |
| HTTP 5xx | Retry up to 3 times |
| Empty page (< 1KB) | Treat as failure, retry |
| Partial HTML | Mark `partial`, extract what's possible |

---

## Over-claiming Prevention

1. **Article code in filename** → match confidence `0.9` (high but not 1.0 because filename ≠ explicit code display)
2. **Exact product name match** (same collection) → confidence `0.8`
3. **Fuzzy name match** → confidence `0.5`, status `fuzzy`
4. **Collection-only match** → confidence `0.3`, NOT assigned
5. **No match** → confidence `0.0`, status `missing`

### Verified vs Fuzzy separation

- `verified`: Article code extracted from image filename matches workbook code exactly
- `fuzzy`: Name match or partial code match — needs human confirmation
- Separate arrays in output: `verified_matches[]` and `fuzzy_matches[]`
- Never merge them automatically

---

## What We Extract (and What We Don't)

### Extract (safe)

- Product page URL
- Product title (raw from `<h1>` or `product-title`)
- Main image URL (first gallery image or largest thumbnail)
- Gallery image URLs (all lightbox links)
- Collection hint (from URL path)
- Category hint (from listing page URL)
- Image filename (for article code extraction)

### Do NOT extract (unsafe)

- Prices
- Dimensions
- Stock status
- Descriptions (unreliable)
- "Add to cart" data

---

## Output Schema

Each scraped product record:

```json
{
  "page_url": "https://woodright.ru/kollekcii/oliver/...",
  "product_title_raw": "Кровать 90*190 с изножьем OLIVER",
  "product_code_raw": null,
  "product_code_from_image": "OL-14-1",
  "category_hint": "krovati",
  "collection_hint": "oliver",
  "main_image_url": "https://woodright.ru/images/detailed/8/ol-14-1-lillian-140.jpg",
  "gallery_image_urls": ["...", "..."],
  "thumbnail_url": "https://woodright.ru/images/thumbnails/570/570/detailed/8/ol-14-1-lillian-140.jpg",
  "scrape_status": "success",
  "scrape_warnings": []
}
```
