# Package D — Data audit (isolated B5)

**DB:** `medusa-admin-ux-b5`
**Date:** 2026-07-12 (MSK)
Anonymized fixture summary only.

## Products (8 fixtures)

| Title | Images | Thumbnail | Thumb in images | Thumb = first |
|-------|-------:|:---------:|:---------------:|:-------------:|
| B5 STANDARD Chair | 2 | yes | no | no |
| B5 CONFIGURABLE Table | 3 | yes | no | no |
| B5 BESPOKE Kitchen | 1 | yes | no | no |
| B5 Missing Type | 1 | yes | no | no |
| B5 No Price | 1 | yes | no | no |
| B5 No Thumbnail | 2 | yes* | yes | yes |
| B5 Draft Product | 1 | yes | no | no |
| B5 Large Gallery | **96** | yes | no | no |

\* Seed intended no thumbnail; runtime shows thumb = first image URL.

## Bucket sizes

| Size | Count |
|------|------:|
| 0 | 0 |
| 1 | 4 |
| 2–10 | 3 |
| 11–30 | 0 |
| 31–60 | 0 |
| 61–100 | 1 (96) |
| 100+ | 0 |

## Notes

- Exact URL duplicates inside fixtures: none observed on standard products; large gallery uses distinct placehold texts.
- Thumbnail often **outside** gallery URLs (separate placehold main) — valid.
- Shared catalog snapshot (read-only, prior audits): products with 96 images exist in shared DB; Package D mutations stay on B5 only.
- Upload writes local `static/` on isolated backend; absolute URLs may show wrong port — normalize to path.

## Variant-media

Admin may expand `variants.images` as the same product image rows. No distinct variant association inventory to edit.
