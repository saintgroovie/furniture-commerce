# Product-Asset Binding Strategy

Стратегия связывания workbook products с processed storefront-ready assets.

---

## What the Binding Layer Does

The binding layer is an **intermediate data file** that connects:
- Workbook product identity (code, name, collection, price, dimensions)
- Processed image assets (main, gallery, color variants)
- Source provenance (disk, legacy, PDF)
- Quality status flags

It does **not** contain production URLs. It maps workbook rows to local processed file paths that will later be uploaded to production storage and converted to stable URLs.

---

## Why It Exists Before seed.ts

| Without binding layer | With binding layer |
|----------------------|-------------------|
| seed.ts must traverse raw manifests | seed.ts reads one clean file |
| Quality flags scattered across multiple files | Quality centralized |
| No single source of truth for product→image | Clear 1:1 mapping |
| Provenance hidden in download logs | Provenance explicit per product |

The binding layer is the **last data preparation step** before the application layer (seed.ts, storage upload) begins.

---

## Workbook Identity → Processed Assets

```
workbook_row_key  ←→  processed files
     ↓                      ↓
  "oliver:OL-01-2"   →  OL-01-2_main.jpg
                      →  OL-01-2_gallery_01.jpg
                      →  OL-01-2_gallery_02.jpg
```

Lookup chain:
1. `production-subset-skeleton.json` → workbook data (code, name, price, dims)
2. `processed-assets.json` → processed files by (collection, code, role)
3. `legacy-fallback-summary.json` → legacy processed files
4. Binding layer merges all three into one record per product

---

## Local Paths Are Intermediate

| Field | Current value | Future value |
|-------|--------------|-------------|
| `processed_main_image` | `data/processed/storefront-assets/oliver/OL-01-2_main.jpg` | `https://cdn.example.com/products/OL-01-2_main.jpg` |

The binding layer stores **local processed paths**. These become production URLs only after:
1. Upload to production storage (S3, Medusa uploads)
2. URL mapping step replaces local paths with CDN/public URLs
3. seed.ts reads the URL-mapped binding layer

---

## Source Priority Rules

| Priority | Source | Quality | When used |
|----------|--------|---------|-----------|
| 1 | Disk white-bg processed | Best | Default for Oliver, Provence, CLP |
| 2 | Verified legacy processed | Good | Fallback when no disk source |
| 3 | Temporary PDF fallback | Acceptable | Only when no other source exists |

**Rule:** A weaker source never replaces a stronger one in the binding layer.

---

## Quality Flags

| Flag | Meaning | Action required |
|------|---------|----------------|
| `ok` | Full quality, ready for production | None |
| `low_res_temporary` | Image < 600px, usable but suboptimal | Flag for reshoot |
| `needs_reshoot` | Image < 300px, barely usable | Must reshoot before launch |
| `legacy_fallback` | From legacy site, not white-bg | Acceptable, note provenance |
| `pdf_temporary` | From PDF catalog extraction | Replace before launch |
| `gallery_only` | Has gallery but no dedicated main | Use first gallery as main |
| `blocked` | Business decision pending | Do not include in seed |
| `missing` | No processed asset at all | Excluded from binding |

---

## Low-Res and Temporary Asset Handling

- PV-14-1 (522×532): marked `low_res_temporary` — usable for MVP
- PV-68-1 (225×287): marked `needs_reshoot` — too small for product page
- All legacy fallback items: marked with `source_type: legacy_fallback`
- Products with only gallery (no main): first gallery image designated as fallback main
