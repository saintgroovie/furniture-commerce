# Catalog options / variants / upholstery — night audit 2026-08-12

## Scope
Read-only catalog audit of live `medusa-store` (157 published products) + PASS C storefront presentation fix.

Worktree: `furniture-commerce-catalog-options-night-20260812`  
Branch: `audit/catalog-options-variants-night-20260812` (from `origin/main`)

## Architecture facts (proven)
- Buyer options are **not** Medusa option matrices. Every product has stub `Default` / `Default`.
- Buyer axes live in `product.metadata` execution arrays + `material_tiers`.
- 1 Medusa variant per product (RUB `solid_full` base). Cart pricing multiplies material/finish on backend.
- Classification linked: CONFIGURABLE 138, STANDARD 19 (orphaned BESPOKE rows exist in classification table without live product links).

## BEFORE metrics (DB)
| Metric | Value |
|---|---|
| Products | 157 |
| Variants | 157 |
| Unique SKUs | 157 |
| Duplicate SKUs | 0 |
| Products with upholstery executions | 18 |
| Upholstery values | 43 |
| Upholstery values with `swatch_hex` | 43 |
| Upholstery values with `swatch_image` texture field | 0 |
| Dimension missing | 29 |
| Dimension zero | 0 |
| Critical structural blockers | 0 |

## Root cause (upholstery UI)
PASS B.1 correctly banned product-thumbnail image swatches (`separateFabricRows`), but also **stripped evidenced `swatch_hex`** and forced text chips for Oliver fabric families. That left buyers without visual samples even though curated family hex colors already exist in metadata.

## PASS C fix (code, no DB mutation)
1. `option-presentation-contract.ts` — semantic `presentation`: `swatch_image` \| `swatch_color` \| `text` \| …
2. Keep evidenced `swatch_hex` on the single «Обивка» axis; never invent textures; never use execution heroes as image swatches.
3. PDP renders color swatches when hex exists; text chips only as fallback.
4. PASS A catalog-card containment unchanged (no family axes on cards).
5. Reusable validator: `scripts/catalog/catalog-options-audit.py`

## AFTER (buyer presentation expectation)
| Axis mode | Products with upholstery |
|---|---|
| `swatch_color` (evidenced hex) | 18 / 18 |
| `swatch_image` (texture URL) | 0 / 18 |
| text fallback | 0 / 18 |

DB metrics unchanged (no catalog mutation). Live PDP RSC payload for `ol-07-1` confirms `presentation:"swatch_color"` + family hex + display labels Leona/Lilian/Linda/Lorna.

## Option taxonomy (found → canonical)
| Source | Canonical |
|---|---|
| `upholstery_color_executions` | `fabric_upholstery_executions` |
| `finish_color_executions` | `paint_finish_executions` |
| Medusa option `Default` | hidden stub (not buyer-facing) |
| Oliver family keys leona/lillian/linda/lorna/torno | buyer axis «Обивка» values (PASS B.1 single axis) |

Intentionally **not** auto-migrated: individual fabric SKUs (Velutto-style), invented texture assets, uncertain dimension fills.

## Owner decisions required
See PR body table. Highlights:
- 29 products with missing dimensions (workbook often empty / «размеры уточнять»)
- 0 confirmed fabric texture assets → color swatches are the evidenced visual layer until textures are approved
- Public-demo upholstery data repair packet still not applied (PASS B owner gate)

## Validator
```sh
DATABASE_URL=… python3 scripts/catalog/catalog-options-audit.py \
  --json-out tmp/catalog-options-audit --label BEFORE
```
Exit `2` only on critical structural blockers (duplicate SKUs, etc.).
