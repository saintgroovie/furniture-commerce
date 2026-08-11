# Admin extension inventory

**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-wt-sales-order-lifecycle-20260725`  
**Scope:** `apps/backend/src/admin/**` + Admin UI extension surface vs Admin REST APIs  
**Date:** 2026-07-25

## Verdict

Woodright has **no Medusa Admin UI widgets or custom Admin routes** (`defineWidgetConfig` / `defineRouteConfig` unused). Admin customization is limited to **Vite plugins** (favicon + host normalize). Custom Admin **REST APIs** exist for room-sets / leads / bespoke-requests / payment-links, but they are not wired into Admin UI extensions.

---

## 1. `apps/backend/src/admin/**` structure

```
apps/backend/src/admin/
  vite/
    favicon-plugin.ts
    normalize-admin-host-plugin.ts
    normalize-admin-host-plugin.test.ts
```

| Path | Role |
|------|------|
| `vite/favicon-plugin.ts` | Injects Woodright Admin favicon data-URIs into Admin HTML |
| `vite/normalize-admin-host-plugin.ts` | Redirects `127.0.0.1` → `localhost` before Admin SPA boot (cookie/CORS fix) |
| `vite/normalize-admin-host-plugin.test.ts` | Unit tests for host plugin |

**Absent (not found):**

- `widgets/`
- `routes/`
- `i18n/`
- any `*.tsx` Admin React components
- any `defineWidgetConfig` / `defineRouteConfig` / `defineLayoutConfig` calls in the worktree

Wired from `apps/backend/medusa-config.ts` → `admin.vite.plugins`:

- `woodrightAdminNormalizeHostPlugin()`
- `woodrightAdminFaviconPlugin()`

---

## 2. Existing widgets / routes / injection zones (project)

| Kind | Present? | Notes |
|------|----------|-------|
| Widgets (`defineWidgetConfig`) | **No** | Zero matches repo-wide |
| Custom Admin routes (`defineRouteConfig`) | **No** | Zero matches |
| Custom layouts (`defineLayoutConfig`) | **No** | Zero matches |
| Product detail UI extensions | **No** | No widgets on `product.details*` |
| Order detail UI extensions | **No** | No widgets on `order.details*` |
| Order list UI extensions | **No** | No widgets on `order.list*` |
| Injection zones used | **None** | N/A |

---

## 3. Related Admin REST APIs (not UI extensions)

These live under `apps/backend/src/api/admin/` and are backend HTTP handlers only (no Admin sidebar/widgets):

| Route prefix | Methods (observed) | Module |
|--------------|--------------------|--------|
| `/admin/room-sets`, `/admin/room-sets/:id` | GET, POST (+ id routes) | `room-set` |
| `/admin/leads`, `/admin/leads/:id` | GET (+ id) | `lead` |
| `/admin/bespoke-requests`, `/admin/bespoke-requests/:id` | GET (+ id/status updates) | `bespoke-request` |
| `/admin/payment-links`, `/admin/payment-links/:id` | GET, POST (+ id) | `payment-link` |

Custom modules registered in `medusa-config.ts`: `product-extension`, `room-set`, `lead`, `bespoke-request`, `payment-link`.

---

## 4. `@medusajs/admin-sdk` version & capabilities

| Item | Value |
|------|-------|
| Declared version | `2.17.2` (`apps/backend/package.json`) |
| Package purpose | SDK for building Medusa Admin dashboard extensions |

**Exports (from `dist/index.d.ts` of 2.17.2):**

- `defineWidgetConfig(config)` → `{ zone, id? }`
- `defineRouteConfig(config)` → `{ label?, icon?, nested?, rank?, translationNs? }`
- `defineLayoutConfig(config)` → `{ id, sections }`
- Types: `WidgetConfig`, `RouteConfig`, `LayoutConfig`

**Zones available via `@medusajs/admin-shared` (paired 2.17.2):** large `INJECTION_ZONES` list including product/order surfaces, e.g.:

- Product: `product.details`, `product.details.before|after`, `product.details.side*`, `product.list*`
- Order: `order.details`, `order.details.before|after`, `order.details.side*`, `order.list`, `order.list.before|after`
- Plus customers, inventory items, draft orders, login, topbar, etc.

**Also in admin-shared (not used by Woodright):**

- Product **custom fields** model (`CUSTOM_FIELD_MODELS: ["product"]`) with form/display zones
- Nested route positions: `/orders`, `/products`, `/inventory`, `/customers`, `/promotions`, `/price-lists`
- Virtual modules: widgets, routes, forms, displays, links, layouts, i18n, menu-items

**Note:** Worktree has no local `node_modules`; capability facts taken from canonical install of the same `@medusajs/admin-sdk@2.17.2` / `@medusajs/admin-shared@2.17.2`.

---

## 5. Order list column extensions?

| Question | Answer |
|----------|--------|
| Does Woodright implement order list column extensions? | **No** |
| Does `@medusajs/admin-sdk@2.17.2` expose a first-class “define order list column” API? | **No** in the public SDK exports |
| What order-list extension surface exists? | Widget **injection zones** only: `order.list`, `order.list.before`, `order.list.after` (page chrome / before-after blocks, not DataTable column definitions) |

**Conclusion:** Custom order-list **columns** are not a supported SDK primitive in this version’s public API. Extending the order list UI today means widgets around the list page (or forking/custom Admin UI outside SDK columns). Product custom-fields exist for **product** forms/displays only - not order list columns.

---

## 6. Gaps relevant to sales-order lifecycle

- No Admin UI for `ProductClassification`, bespoke requests, leads, payment links, or room-sets (APIs only).
- No order-detail / order-list widgets for lifecycle status, payment links, or lead linkage.
- Vite-only Admin customization → greenfield for any Admin UX work.
