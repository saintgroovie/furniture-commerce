# Package D — Storefront media contract

**Reference:** canonical storefront on `origin/main` / local canonical tree
**Package D does not modify storefront.**

## Card (listing)

- Hero: prefer `product.thumbnail`; fallback first `product.images[0]` in card helper.
- Extras: `collectExtraProductImageUrls` from `product.images` excluding hero.

Source: `apps/storefront/src/lib/product-images.ts`, `product-card.tsx`.

## PDP

- Default/OG hero: **`thumbnail`**.
- Gallery: thumbnail + `product.images`, with buyer-facing sort/dedupe helpers (`pdp-buyer-gallery*`).
- URL resolve: `/static` → `/product-static` rewrite; `/uploads` via Medusa base.

## Alignment with Package A / D SoT

| Admin SoT | Storefront usage |
|-----------|------------------|
| `thumbnail` | Card/PDP hero |
| `product.images` order | Extra frames / PDP gallery after buyer helpers |
| `variant.images` | **Not** used as buyer gallery SoT |

**Verdict:** No blocking divergence. Package D may safely edit `thumbnail` + `product.images`. Buyer sort helpers may reorder display relative to raw Admin order — operator should still treat Admin order as catalog SoT; preview opens storefront for visual check.

## Kids / RoomSet

Kids uses the same product media helpers (navigation layer). RoomSet has separate media — out of Package D product gallery scope.
