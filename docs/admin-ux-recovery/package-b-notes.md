# Package B notes

## Classification SoT

Admin field `*product_classification` → `product.product_classification.product_type`
(also accepts camelCase `productClassification` when present)
Values: `STANDARD` | `CONFIGURABLE` | `BESPOKE`
Missing → UI «Тип не указан» (no auto-write).

Package B.5 renamed entity `product_type` → `product_classification` to fix Medusa 2.13 joiner alias collision.

## Preview URL

Canonical storefront PDP: `/product/:id` (product ID, not handle).
Default origin: `http://localhost:3002`
Override: `WOODRIGHT_STOREFRONT_ORIGIN` / `VITE_WOODRIGHT_STOREFRONT_ORIGIN`.

## Feature flag (browser)

Admin Vite bundle does not automatically receive server `process.env`.
Flag detection order in UI:

1. `window.__WOODRIGHT_ADMIN_UX_V1__`
2. `localStorage.WOODRIGHT_ADMIN_UX_V1`
3. `import.meta.env.WOODRIGHT_ADMIN_UX_V1` if injected

Operator enable (dev):

```js
localStorage.setItem("WOODRIGHT_ADMIN_UX_V1", "1")
location.reload()
```

## admin-sdk

Not added to `package.json` (Package B constraint).
Local shim: `src/admin/lib/medusa-admin-sdk.ts`.

## Medusa versions

Unchanged: lockfile remains 2.13.3 family. Upgrade deferred.
