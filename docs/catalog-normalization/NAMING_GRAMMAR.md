# Catalog normalization — naming grammar (derived, not reinvented)

Source of truth for editorial voice: `docs/product-copy/product-copy-style-guide.md`.

## Public title

1. Prefer `metadata.public_title` when set (post-normalization).
2. Else merge Medusa `title` (config-rich) with Latin model from `canonical_name` when title lacks a model.
3. Expand verified pedestal codes `ЯП|ПЯ|ЯЯ|ПП` to natural RU phrases.
4. Storefront transcribes Latin model names via `layoutBuyerFacingTitle` (Hole → Хоул).
5. Do **not** invent materials, sizes, or door counts beyond evidenced config tokens.
6. Keep style-guide abbreviations for doors/beds: `2-дв.`, `1,5-сп.` (do not expand to «двухдверный» en masse).

## Levels

| Level | Field | Example |
|-------|--------|---------|
| Collection | metadata / handle prefix | Provence, Greenwich |
| Model | canonical Latin / transcribed | Scale → Скейл |
| Product type | buyer_item_type (projection) | комод, шкаф |
| Variant / option | executions / material_tiers | отделка, обивка, размер |

## Pedestal desk codes (VERIFIED)

| Code | Meaning |
|------|---------|
| ЯП | ящики слева, полки справа |
| ПЯ | полки слева, ящики справа |
| ЯЯ | ящики с обеих сторон |
| ПП | полки с обеих сторон |

Evidence: `metadata.pedestal_filling` (`DRAWERS`/`SHELVES`) + `family_options`. Marketing prose saying «дверца» loses to structured filling.

## Cards vs PDP

Both must use `getBuyerFacingProductTitle` / public-title contract. Raw `product.title` alone drops Greenwich model names.
