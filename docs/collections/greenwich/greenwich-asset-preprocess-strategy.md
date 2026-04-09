# Greenwich Asset Preprocess Strategy

Preprocessing pipeline for Greenwich legacy site and PDF assets into storefront-ready format.

---

## Raw vs Processed Separation

| Layer | Path | Purpose |
|-------|------|---------|
| Raw downloaded | `data/raw/downloaded-assets/greenwich/` | Immutable originals from legacy site |
| Raw bed pool | `data/raw/downloaded-assets/greenwich/beds/` | Shared bed design-family images |
| Processed | `data/processed/storefront-assets/greenwich/` | Renamed, validated, web-optimized |
| Processed bed pool | `data/processed/storefront-assets/greenwich/beds-shared/` | Shared pool, referenced by all bed rows |

**Rule:** Raw files are never modified. Processed files are always derived copies.

---

## Naming Convention

### Ready items (8 products)

```
{CODE}_{role}_{index}.jpg
```

Examples:
- `GR-05-1_main_01.jpg` — main product shot
- `GR-05-1_gallery_01.jpg` — first gallery image
- `GR-26-1_gallery_12.jpg` — twelfth gallery image

### Bed shared pool (5 products × 23 shared images)

```
GR-BED_{design}_{index}.jpg
```

Examples:
- `GR-BED_frame_01.jpg` — Frame design main candidate
- `GR-BED_cloud_03.jpg` — Cloud design gallery
- `GR-BED_plane_05.jpg` — Plane design gallery

Stored in `beds-shared/` subfolder. All 5 bed workbook rows reference the same pool.

### Temporary PDF fallback (2 products)

```
{CODE}_temp_main_01.png
```

Examples:
- `GR-09-1_temp_main_01.png` — mirror PDF temporary
- `GR-42-1_temp_main_01.png` — TV stand PDF temporary

The `_temp_` infix explicitly marks these as temporary, preventing confusion with production assets.

---

## Processing Rules

### Format normalization

| Input | Output | Quality |
|-------|--------|---------|
| JPEG/JPG | JPEG | 85 |
| WebP | JPEG | 85 |
| PNG (PDF source) | PNG (keep lossless for temp) | — |

### Dimension handling

- **No resize** in this pass — legacy images are web-resolution already
- Record dimensions in manifest for future resize decisions
- Flag images < 400px on either axis as `low_res`
- Flag images > 4000px on either axis as `oversized`

### Validation

- Open with Pillow, verify integrity
- Reject zero-byte or corrupt files
- Compute SHA-256 hash for dedup
- Check for exact duplicates within Greenwich scope

### Duplicate detection

- SHA-256 hash each processed file
- If two files from different sources produce identical hash → mark as duplicate
- Keep first occurrence, reference it from both entries
- Bed pool images are intentionally shared (not duplicates)

---

## Provenance Preservation

Each processed file entry includes:

```json
{
  "raw_source_path": "data/raw/downloaded-assets/greenwich/GR-05-1_main_01.jpg",
  "processed_path": "data/processed/storefront-assets/greenwich/GR-05-1_main_01.jpg",
  "workbook_row_key": "greenwich:GR-05-1",
  "canonical_name": "Комод",
  "product_code_normalized": "GR-05-1",
  "original_legacy_url": "https://woodright.ru/images/detailed/10/greenwich_capuchino04.jpg",
  "sha256": "...",
  "dimensions": [1200, 900],
  "file_size_bytes": 250000,
  "image_role": "main",
  "asset_tier": "ready | bed_shared_pool | temporary_pdf"
}
```

---

## Temporary PDF Handling

- PDF-sourced images (GR-09-1 mirror, GR-42-1 TV stand) are processed separately
- They keep PNG format (no lossy conversion of already-extracted images)
- `asset_tier: "temporary_pdf"` is always set
- They are placed in the same output folder but with `_temp_` prefix
- They must NOT be treated as final production assets
- Before launch: replace with production photography

---

## GR-09-1 Duplicate Code Safety

- GR-09-1 appears as both mirror and bed
- Mirror: `GR-09-1_temp_main_01.png` (temporary PDF)
- Bed: shared pool in `beds-shared/` (no GR-09-1 prefix in filename)
- Processed manifest uses compound key `(workbook_row_key, canonical_name)` to distinguish
- No filename collision possible due to different naming patterns

---

## Output Files

| File | Purpose |
|------|---------|
| `greenwich-processed-assets.json` | Per-file processed manifest |
| `greenwich-processed-summary.json` | Aggregate statistics |
| `greenwich-processed-warnings.json` | Validation warnings |
