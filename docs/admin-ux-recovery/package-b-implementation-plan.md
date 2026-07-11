# Package B — Implementation plan (Product Workspace)

**Branch:** `feat/admin-ux-recovery` @ `8709dac`+
**Medusa upgrade:** deferred (stay on lockfile **2.13.3**; no `package.json` / lockfile edits)

## Versions (inventory only)

| Package | Resolved in worktree node_modules |
|---------|-----------------------------------|
| `@medusajs/medusa` | 2.13.3 |
| `@medusajs/dashboard` | 2.13.3 |
| `@medusajs/admin-shared` | 2.13.3 |
| `@medusajs/icons` | 2.13.3 |
| `@medusajs/ui` | present (nested) |
| `react` / `react-dom` | 18.3.1 |
| `@tanstack/react-query` | 5.64.2 |
| `@medusajs/admin-sdk` | **not installed** (peer only) |

## Extension surface (2.13.x)

Official discovery: files under `src/admin/routes/**` and `src/admin/widgets/**` via `@medusajs/admin-vite-plugin`.

- **Route:** `src/admin/routes/woodright/products/[id]/page.tsx` → `/app/woodright/products/:id`
- **Entry widget:** `product.details.after` zone → link to workspace when `WOODRIGHT_ADMIN_UX_V1` on
- **SDK helpers:** `defineRouteConfig` / `defineWidgetConfig` are identity helpers. Without adding `@medusajs/admin-sdk` to `package.json` (forbidden this package), use local shim `src/admin/lib/medusa-admin-sdk.ts` matching the public contract.
- **Data:** `fetch('/admin/products/:id?fields=…')` + `credentials: 'include'` (same pattern as runtime SKU page). Variants prices via `/admin/products/:id/variants?fields=id,sku,title,*prices`.
- **Classification SoT:** linked entity `productType.product_type` (`STANDARD|CONFIGURABLE|BESPOKE`) via Admin fields `*productType`. Never infer from title/images/variant count. Missing → «Тип не указан».
- **Media SoT:** `thumbnail` + `product.images` only.
- **Preview:** storefront `/product/:id` (canonical in storefront `product/[id]/page.tsx`). Default origin `http://localhost:3002`, override `WOODRIGHT_STOREFRONT_ORIGIN` if present in Vite define / `import.meta.env` when available; no production hardcode.
- **No:** DOM hacks, private dashboard imports, DB, migrations, price/media mutations beyond title/description/status.

## Flag

`WOODRIGHT_ADMIN_UX_V1` via existing `isWoodrightAdminUxV1Enabled()`.
Flag off: widget returns null; route may show “feature disabled” empty state without stock breakage.

## Deliverables

1. Pure view-models + unit tests (classification, price, media, preview, save-state)
2. Product Workspace page (header, tabs Overview working, others stub summaries)
3. Entry widget on stock product page
4. Unsaved guard (`beforeunload` + in-app navigation confirm)
5. Package A error normalizer integration
6. Docs note under `docs/admin-ux-recovery/package-b-notes.md`

## Out of scope

Variant matrix, gallery editor, promotions, inventory editor, Medusa upgrade.
