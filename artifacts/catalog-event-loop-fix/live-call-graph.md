# Live call graph at `424f6379`

`GET /store/catalog-products`

1. `apps/backend/src/api/store/catalog-products/route.ts` `GET`
2. `loadStoreProductList(req, { mode: "browse" })`
3. `query.graph` entity `product` with `BROWSE_PRODUCT_FIELDS` (no `*`)
4. `resolveStorePricingContext` (first region, short memory cache) then `query.graph` entity `product_variant` with `calculated_price.*`
5. in-memory category / product_type filters when those query params exist
6. `dedupeCatalogProductsById`
7. `projectBuyerItemTypesOntoProducts`
8. `projectDefaultBuyerConfigurationsOntoProducts`
9. `sortProductsByMerchandisingOrder`
10. `products.map(projectCatalogBrowseProduct)` allowlist metadata, cap images, slim variants
11. `res.json`

`/health` is a separate route. It writes `OK` and env headers. It does not query the database. It shares this Node process.

`JSON.stringify` of the live 559556-byte body measured 4.76 ms. Parse measured 8.66 ms. Serialization is not the stall.
