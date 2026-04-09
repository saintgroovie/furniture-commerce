# Asset Preprocess Execution Strategy

Стратегия preprocessing raw downloaded disk assets в storefront-ready формат.

---

## Scope

Первая волна: **Oliver** (274 raw files → 279 processed) и **Provence** (66 raw files → 66 processed).
Некоторые raw файлы имеют двойную роль (main + gallery) — для каждой роли создаётся отдельный processed файл.

---

## Target Formats

| Role | Max dimension | JPEG quality | Use case |
|------|--------------|-------------|----------|
| `main` | 1200px (longest side) | 85 | Primary product image on PDP |
| `gallery` | 1000px (longest side) | 82 | Additional product views |
| `color_variant` | 1000px (longest side) | 82 | Color/fabric options |

All outputs are JPEG regardless of source format. PNG sources are converted to JPEG with white background fill for transparency.

---

## Resizing Policy

- Aspect ratio is always preserved (no cropping, no distortion)
- Images smaller than target max dimension are NOT upscaled — saved at original size
- Downscaling uses `Image.LANCZOS` (highest quality resampling)
- Minimum accepted output: 200×200px (flag smaller as `low_res`)

---

## Compression / Optimization

- JPEG quality 85 for main images, 82 for gallery/color variants
- EXIF data is stripped (no camera metadata, reduces file size)
- Progressive JPEG enabled for faster perceived loading
- Target: 80–300KB per processed image (typical for product photography)

---

## Filename Normalization

Raw files retain original Yandex Disk filenames. Processed files get normalized names from download manifest:

| Role | Pattern | Example |
|------|---------|---------|
| main | `{CODE}_main.jpg` | `OL-01-2_main.jpg` |
| gallery | `{CODE}_gallery_{NN}.jpg` | `OL-01-2_gallery_01.jpg` |
| color_variant | `{CODE}_color_{hint}_{NN}.jpg` | `OL-07-1_color_leona_01.jpg` |

---

## Main vs Gallery vs Color Variant Handling

- **Main**: the single preferred product shot (as identified in image map). Gets highest quality.
- **Gallery**: additional angle/detail views. Same product code, different viewpoints.
- **Color variant**: same product in a different color/fabric. Grouped by `color_hint`.
- A raw file that serves as both `main` and `gallery` produces **two** processed files (different sizes/names).

---

## Duplicate Handling

- SHA-256 hashes are computed on both raw and processed files
- If two raw files have identical SHA-256 → one is marked as `duplicate` in manifest
- Both manifest entries are preserved (different roles), but the processed file is created once and the duplicate entry gets `processing_status: dedup_ref`

---

## Provenance Preservation

Every processed file has a manifest entry linking:

```
raw file → processed file
  source_raw_path    → processed_path
  source_sha256      → (computed at processing time)
  original_filename  → processed_filename
```

Raw files in `data/raw/downloaded-assets/` are **never modified or deleted**.
Processed files in `data/processed/storefront-assets/` can be regenerated from raw at any time.

---

## Folder Structure

```
data/processed/
├── storefront-assets/
│   ├── oliver/
│   │   ├── OL-01-2_main.jpg
│   │   ├── OL-01-2_gallery_01.jpg
│   │   └── ...
│   └── provence/
│       ├── PV-02-1_main.jpg
│       └── ...
└── asset-manifests/
    ├── processed-assets.json          ← per-file records
    ├── processed-assets-summary.json  ← aggregate stats
    └── processed-assets-failures.json ← any failures
```

---

## Why Raw Files Remain Untouched

1. **Reproducibility**: processing pipeline can be re-run with different parameters
2. **Audit trail**: raw files are the immutable archive from Yandex Disk
3. **Quality preservation**: processed copies are lossy; raw retains original quality
4. **Rollback safety**: if processing introduces artifacts, raw source is intact
