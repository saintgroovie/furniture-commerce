# Legacy media unpreviewable recovery audit (read-only)

Generated: **2026-05-17T00:46:26Z** by `scripts/audit-legacy-media-unpreviewable-recovery.mjs`.

## Summary

| Metric | Value |
|--------|------:|
| Unpreviewable rows audited | 716 |
| Recovered previewable (QA layer) | 0 |
| Still missing (local binary) | 706 |
| Remote reference only (HTML cache) | 0 |
| Unsupported type | 10 |

### By recovery_status

- **still_missing:** 706
- **unsupported_type:** 10

## Roots scanned

- `apps/backend/static`
- `apps/backend/static/products`
- `data/raw/downloaded-assets`
- `data/processed/storefront-assets`
- `data/raw/front`
- `data/raw/pdf-assets`
- `data/raw/pdf-assets/extracted`
- `data/raw/legacy`
- `data/raw/legacy/cache`
- `data/raw/assets`

**Files indexed:** 3207

## Top recoverable examples

_None in this environment._

## Top missing patterns

- `lo-69-1-i1.jpg` — WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.
- `lo-69-1-i2.jpg` — WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.
- `lon-02-1-i1.jpg` — WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.
- `lon-02-1-i2.jpg` — WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.
- `lon-05-1-i1.jpg` — WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.
- `lon-05-1-i2.jpg` — WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.
- `lon-08-1-i1.jpg` — WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.
- `lon-08-1-i2.jpg` — WOODRIGHT/Yandex source path not mounted; no basename mirror in scanned repo roots.

## Collection samples

**Oxford:** Oxford 1.jpg, Oxford 2.jpg, Oxford 3.jpg  
**Monchelsea:** MNm-c-23-1-leona160.jpg, mn-23-1-i1.jpg, mn-23-1-i2.jpg  
**Country:** lo-69-1-i1.jpg, lo-69-1-i2.jpg, lon-02-1-i1.jpg

## Next safe step

1. Re-run audit after mounting WOODRIGHT mirror or importing basename mirrors under `data/raw/downloaded-assets/`.
2. QA board reads `legacy-media-preview-recovery-map.json` — previews can show without changing inventory `previewable` or assignment identity rules.
3. Do **not** run production media executor from recovery map alone.

## Outputs

- `data/normalized/legacy-media-unpreviewable-recovery-audit.json`
- `data/normalized/legacy-media-preview-recovery-map.json`

## Safety

- No Medusa DB, seed, catalog-scope, evidence JSON, backend runtime, or executor/apply.
- Recovery improves QA preview only; `suggestion-product-guard` unchanged.
