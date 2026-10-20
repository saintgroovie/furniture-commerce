# Catalog consumers on live SHA `424f6379`

Proven from that tree, not from a later `main` tip.

| Page or action | Server `/store/catalog-products` | Client `/store/catalog-products` | Total |
|---|---:|---:|---:|
| `/` | 1 (`app/page.tsx` `getCatalogProducts`) | 0 | 1 |
| `/catalog` | 1 (`app/catalog/page.tsx`) | 1 (`CatalogBrowseClient` via `medusaFetch`, `cache: no-store`) | 2 |
| `/catalog` with collection filter | 1, then filters in memory | 1, then filters in memory | 2 |
| `/kids/catalog` | 1 | 1 | 2 |
| PDP with `display_group` | 1 (`getCatalogProducts` for siblings) plus product detail | 0 | 1 |
| PDP without `display_group` | 0 | 0 | 0 |
| hard reload of `/catalog` | 1 | 1 | 2 |
| client catalog to PDP to back | catalog RSC again, plus PDP sibling fetch when grouped | catalog client fetch again on each catalog mount | 2 per catalog view |

Classification for `/catalog` and `/kids/catalog`: `REDUNDANT_FULL_CATALOG_FETCH`.

The client fetch is still in the live source. This branch passes `hydratedPool` so those two pages no longer issue the second call.

Home, sitemap, kids index, and grouped PDPs still call the endpoint once each. That is one build, not a duplicate of data the same render already held.
