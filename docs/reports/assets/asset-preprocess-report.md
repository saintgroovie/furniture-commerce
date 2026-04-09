# Asset Preprocess Report

Отчёт о preprocessing raw disk assets Oliver + Provence в storefront-ready формат.

---

## Executive Summary

**345 assets** обработаны, **0 failures**, **0 low-res**, **0 collisions**.
106.3 MB raw → **16.8 MB processed** (84% сжатие).
**88 продуктов** покрыты, из них **63 имеют main image**.
Processed asset layer **готов к будущему ingestion**.

---

## Processing Settings

| Parameter | Main | Gallery / Color |
|-----------|------|-----------------|
| Max dimension | 1200px | 1000px |
| JPEG quality | 85 | 82 |
| Progressive JPEG | Yes | Yes |
| EXIF strip | Yes | Yes |
| Upscaling | No | No |
| Format | JPEG | JPEG |

---

## Oliver Results

| Metric | Value |
|--------|-------|
| Input entries | 279 |
| Processed | 276 |
| Dedup copies | 3 |
| Failed | 0 |
| Output files | 279 |
| Products covered | 63 |
| With main image | 40 |
| Gallery images | 119 |
| Color variants | 120 |

### Oliver File Sizes

| Metric | Value |
|--------|-------|
| Total processed | ~13.4 MB |
| Average file | ~48 KB |
| Min | 12 KB |
| Max | 322 KB |

---

## Provence Results

| Metric | Value |
|--------|-------|
| Input entries | 66 |
| Processed | 66 |
| Dedup copies | 0 |
| Failed | 0 |
| Output files | 66 |
| Products covered | 25 |
| With main image | 23 |
| Gallery images | 43 |
| Color variants | 0 |

### Provence File Sizes

| Metric | Value |
|--------|-------|
| Total processed | ~3.4 MB |
| Average file | ~52 KB |
| Min | 14 KB |
| Max | 322 KB |

---

## Compression Analysis

| Metric | Value |
|--------|-------|
| Raw input | 106.3 MB |
| Processed output | 16.8 MB |
| Compression ratio | 16% (84% reduction) |
| Avg raw file | 316 KB |
| Avg processed file | 50 KB |

The high compression is expected: raw product photography at 2000–4000px is resized to 1000–1200px and re-compressed with optimized JPEG settings.

---

## Validation Results

| Check | Result |
|-------|--------|
| Expected vs actual file count | **Pass** (345 = 345) |
| Missing files | **Pass** (0) |
| Extra files | **Pass** (0) |
| Zero-byte files | **Pass** (0) |
| Filename collisions | **Pass** (0) |
| Low-resolution outputs | **Pass** (0) |
| Processing failures | **Pass** (0) |
| Dimension range | 600–1200px (all within policy) |

---

## Deduplication

3 Oliver files had identical raw content (same SHA-256) serving different manifest roles. These were copied rather than re-processed. This happens when a single raw file is both `main` and `gallery` for the same product — the manifest creates two entries with different target filenames but the same source.

---

## Product Coverage

| Collection | Products | With main | With gallery | With color |
|-----------|----------|-----------|-------------|-----------|
| Oliver | 63 | 40 | 44 | 19 |
| Provence | 25 | 23 | 22 | 0 |
| **Total** | **88** | **63** | **66** | **19** |

25 Oliver products don't have a preferred main image from disk (they use legacy site images). Gallery-only disk assets are still valuable as supplementary views.

---

## Folder Structure Created

```
data/processed/
├── storefront-assets/
│   ├── oliver/                 279 files, ~13.4 MB
│   │   ├── OL-01-2_main.jpg
│   │   ├── OL-01-2_gallery_01.jpg
│   │   ├── OL-07-1_color_leona_01.jpg
│   │   └── ...
│   └── provence/               66 files, ~3.4 MB
│       ├── PV-02-1_main.jpg
│       ├── PV-02-1_gallery_01.jpg
│       └── ...
└── asset-manifests/
    ├── processed-assets.json           345 records
    ├── processed-assets-summary.json   aggregate stats
    └── processed-assets-failures.json  0 failures
```

---

## Failures / Blockers

**None.** Zero processing failures. All 345 entries produced valid outputs.

---

## Ready-for-Next-Step Assessment

| Criterion | Status |
|-----------|--------|
| Processed files exist | **Yes** (345 files) |
| All valid JPEG | **Yes** |
| No zero-byte/corrupt | **Yes** |
| Normalized filenames | **Yes** |
| Provenance tracked | **Yes** (manifest links raw → processed) |
| Role assignment intact | **Yes** (63 main, 162 gallery, 120 color) |
| Compression reasonable | **Yes** (50KB avg, 12–322KB range) |

**Processed asset layer is ready for future seed/storefront ingestion.**

---

## Should Country-London-Paris Be Downloaded Next?

**Yes.** Country-London-Paris has 89 files in the download manifest and 13 products in the production subset. The download + preprocess pipeline is proven stable. Estimated effort: ~4 min download + ~2 min preprocess.

---

## Files Created / Updated

| File | Purpose |
|------|---------|
| `docs/assets/asset-preprocess-execution-strategy.md` | Preprocess strategy and policies |
| `docs/reports/assets/asset-preprocess-report.md` | This report |
| `scripts/preprocess-downloaded-assets.py` | Preprocess pipeline script |
| `data/processed/storefront-assets/oliver/` | 279 processed Oliver images |
| `data/processed/storefront-assets/provence/` | 66 processed Provence images |
| `data/processed/asset-manifests/processed-assets.json` | 345 per-file records |
| `data/processed/asset-manifests/processed-assets-summary.json` | Aggregate stats |
| `data/processed/asset-manifests/processed-assets-failures.json` | 0 failures |

---

## Recommended Next Steps

1. **Download + preprocess Country-London-Paris** (89 files, ~27 MB raw)
2. **Download legacy fallback images** for 7 Oliver/Provence items without disk assets
3. **Build seed data mapping** — connect processed assets to Medusa product entities
4. **Set up production storage** — configure S3/uploads for Medusa file hosting
