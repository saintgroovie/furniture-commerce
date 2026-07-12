# Current Medusa Admin inventory (Package A)

**Date:** 2026-07-12 (MSK)  
**Recovery branch / worktree:** `feat/admin-ux-recovery` @  
`/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-recovery`  
**Base:** `origin/main` (`b91fa15`)  
**Live runtime probed:** `http://127.0.0.1:9000` (LaunchAgent `com.woodright.medusa-backend`, serves canonical dirty-tree backend with Woodright admin extensions)

---

## 1. Dual baseline (critical)

| Layer | `origin/main` (this worktree) | Live runtime / later local commits |
|-------|-------------------------------|-------------------------------------|
| Medusa lock | **2.13.3** (`^2.0.0`) | Often **2.17.2** + `@medusajs/admin-sdk` |
| `apps/backend/src/admin/` | **Absent** | Present (widgets, routes, i18n, vite plugins) |
| Admin UX | Stock Medusa Dashboard only | Stock + Woodright SKU route + site-status widget + ru locale |
| Custom Admin API | Room Sets / Leads / Bespoke / Payment Links | Same + `GET /admin/woodright/products/:id/site-readiness` (runtime) |

**Decision for recovery:** implement all admin UX work on `feat/admin-ux-recovery` from `origin/main`, introducing `src/admin` as an extension layer. Do **not** mix PR #15 (`qa/willie-winkie-flow-a-matrix-board`) or PR #16 (storefront design) into this branch. Optionally port **only** proven admin-stability files (vite plugins, ru-supplement, admin-sdk dep) as explicit Package A/B commits after review.

---

## 2. Versions (this worktree)

| Package | Declared | Resolved (`yarn.lock`) |
|---------|----------|-------------------------|
| `@medusajs/medusa` | `^2.0.0` | **2.13.3** |
| `@medusajs/framework` | `^2.0.0` | **2.13.3** |
| `@medusajs/cli` | `^2.0.0` | **2.13.3** |
| `@medusajs/dashboard` | transitive | **2.13.3** |
| `@medusajs/js-sdk` | transitive | **2.13.3** |
| `@medusajs/ui` | transitive | **4.1.3** |
| `@medusajs/admin-sdk` | not direct | peer of dashboard only — **not installed** |

---

## 3. How admin is built and served

### Scripts (`apps/backend/package.json`)

- `dev` → `medusa develop` (API `:9000` + Vite admin)
- `start` → `medusa start`
- `build` → `medusa build`

### Config (`medusa-config.ts` on main)

- Minimal `admin.vite`: `host: 0.0.0.0`, HMR port `5173`
- CORS via `ADMIN_CORS`
- No Woodright vite plugins on main

### Live runtime extras (not on main)

- Locale plugin (`ADMIN_DEFAULT_LOCALE=ru`)
- Favicon / disable-HMR / prune-cache / stale-chunk / eager-route-deps
- `optimizeDeps.include` includes `@medusajs/admin-sdk`

**URL operators use:** `http://localhost:9000/app` (and `/app/login`).

---

## 4. `src/admin` on main vs runtime

### Main (this worktree)

Directory **does not exist**.

### Runtime / later local tree (reference only)

| Path | Purpose |
|------|---------|
| `widgets/product-woodright-site-status.tsx` | Zone `product.details.after` — site readiness panel |
| `routes/woodright/sku/page.tsx` | Operator SKU table (loads all products via Admin API) |
| `components/woodright/*` | Site status UI + labels |
| `i18n/ru-supplement.json` | Russian keys missing from stock Medusa |
| `lib/collection-display-labels.ts` | Collection title localization |
| `vite/*` | Dev stability for admin Vite |
| `assets/favicon-w-*.png` | Brand favicon |

---

## 5. Custom Admin API (main)

| Route | Methods | Notes |
|-------|---------|-------|
| `/admin/room-sets` | GET, POST | Custom module |
| `/admin/room-sets/:id` | GET, PATCH, DELETE | |
| `/admin/leads` | GET | |
| `/admin/leads/:id` | GET | |
| `/admin/bespoke-requests` | GET | |
| `/admin/bespoke-requests/:id` | GET, PATCH | |
| `/admin/payment-links` | GET, POST | |
| `/admin/payment-links/:id` | GET, PATCH | |

**Gap:** no Medusa Admin UI routes/widgets for these on main — API-only. Operators cannot manage Room Sets / Leads / Bespoke / Payment Links inside Admin without custom screens (documented in `docs/admin-flows.md`, not implemented as UI).

---

## 6. Custom modules

| Module | Role |
|--------|------|
| `product-extension` | `ProductType` enum `STANDARD \| CONFIGURABLE \| BESPOKE`, linked 1:1 to Product |
| `room-set` | RoomSet + RoomSetItem (`hero_image`, `gallery` JSON) |
| `lead` | Lead contacts |
| `bespoke-request` | Quote requests |
| `payment-link` | Manual payment links |

Links: `product-product-extension.ts`, `room-set-product.ts`.  
BESPOKE cart guard: `src/api/middlewares.ts`.

---

## 7. Product classification (Woodright)

- **Source of truth:** linked `ProductType.product_type` (not Medusa core `product.type`).
- **Semantics:** see `docs/product-rules.md` — STANDARD cart-only; CONFIGURABLE cart+quote; BESPOKE quote-only.
- **Admin UI:** stock Admin does **not** expose Woodright `product_type`. Runtime site-readiness API returns `storefront.product_type` for diagnostics only.
- **Storefront contract risk:** storefront often reads `product_classification`; store API fields use `productType.*` — naming mismatch.

---

## 8. Media model

### Buyer-facing SoT (storefront)

Documented/implemented in `apps/storefront/src/lib/product-images.ts`:

| Role | Source |
|------|--------|
| Hero | `product.thumbnail` |
| Gallery extras | `product.images[].url` |
| Card grouping extras | `metadata.display_group*` |

**`variant.images` is not used** on the storefront.

### Operator / QA (not Admin)

Legacy media assignment boards under `apps/storefront/src/app/qa/**` — operator tools with `do_not_auto_apply`; **not** Medusa Admin. Changing media model requires migration plan + review (`docs/storefront/polished-storefront-baseline.md`, media-ops docs on canonical).

### Live catalog evidence (2026-07-12)

Admin API sample (`Комод` `prod_01KM1QHNHNKSG173KZ6C2AZ5JR`):

- 1 variant, option title **`Default`**
- **96** product images
- thumbnail set
- price available only when requesting `*prices` on variants endpoint (`109500 rub`) — easy to miss in default product payload
- rich `metadata` (finish executions, dimensions, workbook keys) — technical noise for operators in stock Admin

Across first 50 admin products: **0 products with >1 variant** in that page — catalog is mostly “one Default variant per product”, while color/finish complexity lives in **metadata + many images**, not option matrix.

---

## 9. Promotions

- Stock Medusa promotions/campaigns UI available.
- Live: `GET /admin/promotions?limit=5` → **0 promotions**.
- Store cart auto-apply promotions patched out (`scripts/patch-skip-cart-promotions.mjs`, Medusa #14149) — affects storefront cart, not Admin UI structure.
- No Woodright promotion wizard on main or runtime.

---

## 10. Localization

| Item | Main | Runtime |
|------|------|---------|
| `ADMIN_DEFAULT_LOCALE` | not wired | `ru` via vite plugin |
| `src/admin/i18n` | absent | `ru-supplement.json` |
| Seed / product titles | Russian | Russian |

Stock Admin still exposes English developer terminology (promotions rules, price sets, etc.).

---

## 11. Errors / toasts

- Main: stock Medusa Admin only.
- Runtime widget: inline Russian error string; often surfaces raw `HTTP` / body text.
- No shared error normalizer yet (Package A foundation).

---

## 12. Roles / permissions

- Local admin bootstrap: `medusa exec ./src/scripts/ensure-local-admin.ts` (`LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD`).
- No custom RBAC for Woodright operator vs developer surfaces yet.
- Target: technical sections under «Система» / permission gate (later packages).

---

## 13. Problem source map (inventory-level)

| Problem class | Source |
|---------------|--------|
| Variant matrix missing / Default-only options | Data model + stock Admin UX + catalog shape |
| Huge unordered galleries (50–100+ images) | Data + stock Media UI; Woodright metadata not surfaced as operator gallery |
| Prices hard to see | Stock Admin / field selection; not a second price engine |
| No product_type in Admin | Woodright gap (module exists, UI missing) |
| Room Sets / Leads / Bespoke / Payment Links | Woodright API without Admin UI |
| Promotion wizard incomprehensible | Mostly stock Medusa terminology |
| Technical errors in UI | Stock + thin custom widgets |
| Admin Vite instability | Runtime mitigations exist; not on main |
| Cannot fix without core fork | Anything requiring rewrite of `@medusajs/dashboard` internals |

---

## 14. What must not be changed without separate review

- Medusa core / `node_modules` patches beyond existing documented postinstall cart-promotions workaround
- Buyer-facing media contract (`thumbnail` + `product.images`)
- `STANDARD` / `CONFIGURABLE` / `BESPOKE` semantics
- Direct DB writes / destructive migrations
- Auto-apply from QA media boards

---

## 15. Package A follow-ups (implementation)

1. Introduce `src/admin` foundation on this branch (feature flag, error normalizer, shared components).  
2. Align Medusa + `admin-sdk` versions when building Vite extensions (prefer lockstep with runtime 2.17.x **or** stay on 2.13.3 until upgrade package — decide in Codex plan review).  
3. Port stability/i18n plugins only as scoped commits.  
4. Packages B–E: Product Workspace, variant matrix, gallery, promotions — extension layer only; stock Admin remains fallback.
