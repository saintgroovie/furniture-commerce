# Leftover patch analysis (no-apply)

Worktree: `hygiene-safe-20260918` @ `origin/main` + hygiene commits.
Question: can C2 / C3 / C4 land without buyer-visible regression?
Answer: **no. Keep parked.**

## C2 `route-veil.tsx`

Current `main` already waits for ATF decode, treats failed images (complete + natural size 0) as settled, polls while `.route-loading-fallback` exists, and has a boot `stuck` timeout (`VEIL_IMAGE_WAIT_CAP_MS + 2000`).

Parked patch vs that:

| Hunk | Effect | Verdict |
|---|---|---|
| Remove fallback `setTimeout(tick, 50)` → bare `return` | If `loading.tsx` stays mounted, boot effect never calls `commit()` | P0 stick |
| Remove `stuck` timeout | No second path if fallback never unmounts | P0 stick |
| `incompleteAtf`: failed images stay pending | Veil can sit until 8s cap on broken img | P1 delay |
| `pendingImages`: skip only `complete && naturalWidth > 0` | Broken complete imgs re-enter pending | P1 delay |
| `decodeSoon` without `decodedSrcs` | Weaker settle tracking | P2 |
| `bootCover` `setTop(0)` | `top` already starts at 0; boot path already returns | no-op |

No hunk is both useful and regression-free. Do not apply, even surgically, without a new failing reproduction on `main`.

## C3 `product-card.tsx`

`cardThumbnailSrcFromProduct` is not a shorthand for `thumbnail \|\| images[0]`. It also runs `preferClosedFrontCatalogHero` (wardrobe closed-front) then `resolveStorefrontProductImageSrc`.

Parked inline thumb skips closed-front. Grouped-card title `product.title` when `displayGroup` is set skips `getBuyerFacingProductTitle` (EN → buyer Cyrillic).

Do not apply.

## C4 browse slim

`projectCatalogBrowseProduct` is the wire for:

- `/store/catalog-products` (home, catalog, kids, sitemap, bespoke, PDP display-group siblings)
- promotion slot (`load-promotion-slot.ts`)

Consumers that break if C4 lands as-is:

| Consumer | Needs |
|---|---|
| `promotion-card.tsx` `priceFrom` | `buyer_default_configuration.material_execution_code` |
| `catalog-card-price.ts` | `min_unit_price`; fallback `material_tiers` multipliers |
| `sale-price.ts` | `min_unit_price` + `original_min_unit_price` |
| `buildMaterialTierOptions` | `key`, `label_ru`, `price_multiplier`, `position`; `description_ru` optional |
| `getDimensions` | `dimensions ?? dimensions_normalized` |
| `BuyerDefaultConfiguration` (backend type) | also `material_execution_label`, `material_price_multiplier`, `variant_id`, `color_multiplier` |

C4 keeps two price numbers and drops the rest, including `description_ru` and `dimensions_normalized` when `dimensions` exists.

Do not apply. A future slim must keep at least `material_execution_code` and pass the new fidelity tests.

## What we locked

- Backend + storefront browse fidelity: full cfg + tiers + both dimension keys pass through.
- Source lock: veil failsafe, product-card helper + buyer title, promotion `material_execution_code`.
