# Design recovery integration (2026-07-15)

Clean integration branch built from `origin/main`, reconstructing approved
storefront design and product-presentation contracts from recovery tip
`4c80c76` without merging the full feature/recovery history.

## Included

- Material-tier PDP contracts and gated price UI
- Approved global CSS / shell / catalog / PDP chrome
- HeaderLogo / SiteFooter hydration-safe kids chrome (from recovery stabilize)
- Cart `getCart` retrieve field `+items.product.metadata` for Kids grouping

## Excluded

- Feature-branch history and catalog-performance commits
- Admin UX PR #23
- Dirty backend cart guards / media apply / blobs
- Inflight cart request dedupe

## Known non-blocking

- Missing derivative `ol-84-2-i2.webp` (JPG fallback active)
