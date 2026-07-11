# Medusa Admin UX audit (Package A)

**Date:** 2026-07-12 (MSK)  
**Method:** code/docs inventory + live Admin/Store API probes on `:9000` + stock Medusa Admin behavior review.  
**Interactive browser matrix (1440/1280/1024) and full E2E save flows:** deferred to Package B+ validation with feature-flagged UI — findings below already block reliable operator use.

**Catalog snapshot:** 157 products via Admin API; first 50 products all have **1 variant** and option **`Default`**. Sample `Комод` has **96 images**, price `109500 rub` only when `*prices` requested. **0** promotions configured.

---

## Severity summary

| Severity | Count (this audit) |
|----------|-------------------|
| P0 | 3 |
| P1 | 8 |
| P2 | 12 |
| P3 | 6 |

---

## Findings

### ADM-P0-001 — Prices invisible / easy to believe variants have no price

- **Section:** Variants and prices  
- **Scenario:** Open product → inspect variant pricing  
- **Severity:** P0  
- **Description:** Default Admin product payload often omits nested prices; operators see empty price UI while `/admin/products/:id/variants?fields=…,*prices` returns RUB amounts.  
- **User harm:** Wrong price edits, “missing price” false alarms, publishing without understanding money.  
- **Evidence:** `Комод` variant `GR-05-1` — product detail without `*prices` → `prices: undefined`; variants endpoint → `amount: 109500`, `currency_code: rub`.  
- **Source:** Stock Medusa Admin / API field selection  
- **Entity:** ProductVariant + Price  
- **Fix:** Product Workspace / variant matrix always loads prices via typed Admin API; human “нет цены” only when truly empty.  
- **Layer:** custom route + adapter  
- **Regression risk:** Medium (must not invent prices)  
- **Deps:** Package B/C  
- **Status:** open  

### ADM-P0-002 — Gallery volume without structure risks wrong hero / storefront mismatch

- **Section:** Gallery  
- **Scenario:** Understand which image is main; which frames are noise  
- **Severity:** P0  
- **Description:** Products carry dozens–hundreds of `product.images` while buyer hero is only `thumbnail`. Stock Admin does not explain Woodright metadata (`finish_color_executions`, shared scenes, etc.).  
- **User harm:** Wrong thumbnail, broken catalog cards, accidental deletion of buyer-facing frames.  
- **Evidence:** `Комод` — 96 images; thumbnail `/static/products/greenwich/GR-05-1_greenwich_white04.jpg`; metadata includes execution matrices.  
- **Source:** Data shape + stock Media UI + Woodright metadata not operator-facing  
- **Entity:** Product.images, Product.thumbnail, metadata  
- **Fix:** Gallery workspace: hero explicit, order, coverage; **do not** invent variant.images SoT; respect `product-images.ts` contract.  
- **Layer:** custom route (+ optional thin read adapter)  
- **Regression risk:** High if media SoT changes  
- **Deps:** Package D; media migration review if model changes  
- **Status:** open  

### ADM-P0-003 — Promotions / cart semantics can silently disagree with storefront

- **Section:** Promotions  
- **Scenario:** Create promotion and verify cart  
- **Severity:** P0  
- **Description:** Store cart auto-apply promotions are patched out (`patch-skip-cart-promotions.mjs`). Admin can still create stock promotions that **do not** apply as operators expect on storefront.  
- **User harm:** False confidence in discounts; pricing disputes.  
- **Evidence:** 0 promotions in Admin; patch documented for Medusa #14149; baseline docs note promotions disabled on cart create.  
- **Source:** Woodright postinstall patch + stock promotion UI  
- **Entity:** Promotion / Cart workflows  
- **Fix:** Operator promotion flow must state current storefront capability; verify via real cart; do not fake preview.  
- **Layer:** custom route + copy (+ optional adapter); **not** a second promo engine  
- **Regression risk:** High  
- **Deps:** Package E; explicit cart verification  
- **Status:** open  

### ADM-P1-001 — Woodright product type invisible in Admin

- **Section:** Catalog / product header  
- **Scenario:** Know STANDARD / CONFIGURABLE / BESPOKE  
- **Severity:** P1  
- **Description:** Classification lives in linked `ProductType`; stock Product page does not show/edit it.  
- **User harm:** Wrong CTA expectations; BESPOKE risk if operators treat as normal SKU.  
- **Evidence:** Module `product-extension`; site-readiness returns `product_type: STANDARD` for sample; stock UI has no field.  
- **Source:** Woodright gap  
- **Entity:** ProductType link  
- **Fix:** Header + overview widget/route; edit via Admin API/workflows only.  
- **Layer:** widget / custom route  
- **Status:** open  

### ADM-P1-002 — Option model is “Default” while commercial complexity is in metadata

- **Section:** Variants  
- **Scenario:** Understand color / finish variants  
- **Severity:** P1  
- **Description:** Options are single `Default`; finish/color matrices live in metadata. Operators looking for a variant matrix find one row and a wall of images.  
- **User harm:** Cannot manage “variants” as the business understands them.  
- **Evidence:** 50/50 products with 1 variant; metadata keys `finish_color_executions`, `greenwich_paint_execution_matrix`.  
- **Source:** Catalog modeling + stock Admin  
- **Entity:** ProductOption / Variant / metadata  
- **Fix:** Matrix UI for real Medusa options when present; separate honest UI for metadata executions **without** pretending they are Medusa variants until model decision.  
- **Layer:** custom route + architecture decision (no silent core change)  
- **Status:** open  

### ADM-P1-003 — No Room Sets / Leads / Bespoke / Payment Links Admin UI

- **Section:** Navigation / custom entities  
- **Scenario:** Process lead → bespoke → payment link  
- **Severity:** P1  
- **Description:** Admin API exists; Medusa Admin screens do not (on main). Docs promise flows in `admin-flows.md`.  
- **User harm:** Operators cannot complete documented flows in Admin.  
- **Evidence:** `src/api/admin/*` present; no `src/admin/routes` on main.  
- **Source:** Woodright gap  
- **Fix:** Custom Admin routes using same APIs.  
- **Layer:** custom route  
- **Status:** open  

### ADM-P1-004 — Technical / raw errors in custom surfaces

- **Section:** Notifications  
- **Scenario:** Failed fetch on site-status widget  
- **Severity:** P1  
- **Description:** Errors can surface raw body / `HTTP 4xx` without next step.  
- **Evidence:** Runtime widget `setError(e.message)` from `res.text()`.  
- **Source:** Woodright custom  
- **Fix:** Shared error normalizer (Package A) + catalog.  
- **Layer:** copy + shared lib  
- **Status:** in_progress (foundation)  

### ADM-P1-005 — Unclear save / publish consequences

- **Section:** Product save  
- **Scenario:** Edit title/status and leave page  
- **Severity:** P1  
- **Description:** Stock Admin does not speak operator language for draft vs published vs storefront visibility (kids/catalog/bespoke placement).  
- **Evidence:** site-readiness placement rules exist in runtime API but not in main product chrome.  
- **Source:** Stock + Woodright gap  
- **Fix:** Product header status + unsaved guard (Package B).  
- **Layer:** custom route / widget  
- **Status:** open  

### ADM-P1-006 — SKU discovery path is weak / custom table loads entire catalog

- **Section:** Catalog search  
- **Scenario:** Find by SKU  
- **Severity:** P1  
- **Description:** Runtime SKU page fetches products in pages of 200 until exhausted — does not scale; stock search is product-title oriented.  
- **Evidence:** `routes/woodright/sku/page.tsx` loop `PAGE_LIMIT = 200`.  
- **Source:** Woodright custom  
- **Fix:** Server-side search/pagination; do not load full catalog.  
- **Layer:** custom route + adapter  
- **Status:** open  

### ADM-P1-007 — Promotion creation requires Medusa internal concepts

- **Section:** Promotions  
- **Scenario:** “Скидка 15% на коллекцию”  
- **Severity:** P1  
- **Description:** Stock flow exposes application methods, rule attributes, campaigns without operator summary.  
- **Evidence:** Stock Admin + zero configured promotions; no Woodright wizard.  
- **Source:** Stock Medusa  
- **Fix:** Package E wizard over stock Promotion APIs.  
- **Layer:** custom route  
- **Status:** open  

### ADM-P1-008 — Admin extension baseline missing on `origin/main`

- **Section:** Platform  
- **Scenario:** Develop/run Woodright Admin extensions  
- **Severity:** P1  
- **Description:** Worktree has no `src/admin`; no `admin-sdk` dependency — Vite extensions cannot build as on runtime.  
- **Evidence:** inventory §1–2.  
- **Source:** Branch gap  
- **Fix:** Package A/B bootstrap + version alignment decision.  
- **Layer:** config / deps (not core fork)  
- **Status:** in_progress  

### ADM-P2-001 — Metadata dump overwhelms product detail

- **Section:** Product overview  
- **Severity:** P2  
- **Description:** Workbook/ingestion metadata shown as technical JSON-ish fields.  
- **Fix:** Move to «Служебное» collapsible.  
- **Layer:** layout / widget  
- **Status:** open  

### ADM-P2-002 — Collection labels English in data, Russian expected in UI

- **Section:** Catalog  
- **Severity:** P2  
- **Evidence:** Runtime `collection-display-labels.ts` exists for localization.  
- **Fix:** Reuse labels map in new UI.  
- **Layer:** copy  
- **Status:** open  

### ADM-P2-003 — No empty/loading language for Woodright panels

- **Section:** States  
- **Severity:** P2  
- **Fix:** Shared empty/loading components.  
- **Layer:** layout  
- **Status:** open  

### ADM-P2-004 — No feature flag for large Admin UX surfaces

- **Section:** Platform  
- **Severity:** P2  
- **Fix:** `WOODRIGHT_ADMIN_UX_V1` (Package A).  
- **Layer:** feature flag  
- **Status:** in_progress  

### ADM-P2-005 — Dashboard not operator-actionable

- **Section:** Dashboard  
- **Severity:** P2  
- **Description:** No links to “products without prices/images”, ending promos, etc.  
- **Fix:** Package F widgets with filtered deep links; avoid heavy queries.  
- **Layer:** widget  
- **Status:** open  

### ADM-P2-006 — Inventory / stock status not co-located with price and SKU

- **Section:** Variants  
- **Severity:** P2  
- **Fix:** Matrix columns (Package C).  
- **Layer:** custom route  
- **Status:** open  

### ADM-P2-007 — No confirmation copy for destructive media/variant actions in operator language

- **Section:** Confirmations  
- **Severity:** P2  
- **Fix:** Shared confirm patterns.  
- **Layer:** copy / components  
- **Status:** open  

### ADM-P2-008 — Storefront preview not first-class in Admin header

- **Section:** Product header  
- **Severity:** P2  
- **Fix:** Preview button using handle + storefront base URL.  
- **Layer:** widget / route  
- **Status:** open  

### ADM-P2-009 — Kids / project / catalog placement opaque

- **Section:** Overview  
- **Severity:** P2  
- **Evidence:** site-readiness placement array explains surfaces — not shown in stock UI.  
- **Fix:** Overview panel.  
- **Layer:** widget  
- **Status:** open  

### ADM-P2-010 — Bulk variant edits unsafe / unclear in stock UI

- **Section:** Variants  
- **Severity:** P2  
- **Fix:** Explicit safe bulk fields only (Package C).  
- **Layer:** custom route  
- **Status:** open  

### ADM-P2-011 — Accessibility: icon-only actions in stock tables

- **Section:** a11y  
- **Severity:** P2  
- **Fix:** Ensure new UI has labels/tooltips; don’t rely on DOM hacks of stock.  
- **Layer:** layout  
- **Status:** open  

### ADM-P2-012 — Narrow widths (1024) — stock tables overflow

- **Section:** Responsive  
- **Severity:** P2  
- **Fix:** Matrix/gallery designed for 1024+ with sticky columns.  
- **Layer:** layout  
- **Status:** open  

### ADM-P3-001 — English leftovers in stock navigation

- **Severity:** P3 — copy / i18n supplement  

### ADM-P3-002 — Developer IDs prominent in stock detail URLs/UI

- **Severity:** P3 — hide in Woodright chrome; keep in technical drawer  

### ADM-P3-003 — Favicon / brand weak on main Admin

- **Severity:** P3 — port favicon plugin  

### ADM-P3-004 — HMR reload loops historically on Admin Vite

- **Severity:** P3/P2 historically — port disable-hmr / cache plugins  

### ADM-P3-005 — Success toasts too technical

- **Severity:** P3 — message catalog  

### ADM-P3-006 — Docs status labels Russian vs English enums

- **Severity:** P3 — terminology map  

---

## Scenario coverage matrix (Package A)

| Scenario group | Exercised how | Result |
|----------------|---------------|--------|
| Catalog find/list | Admin API search/list | Works; SKU UX weak |
| Product type | site-readiness + module code | Data exists; UI missing |
| Variants create/edit matrix | API sample | Catalog mostly 1×Default — matrix UX still required for CONFIGURABLE future + honest metadata UX |
| Prices | Admin variants `*prices` | Data OK; UI discovery P0 |
| Gallery | Admin product images count | Structure P0 |
| Promotions | Admin list + patch docs | Empty + semantic P0 |
| Orders/customers/settings | Not fully interactive this pass | Stock fallback remains |
| Visual 1440/1280/1024 + console | Not completed | Required before Package B `done` |

---

## Implementation priority (safe extension layer)

1. **Package A:** foundation (this doc set + error normalizer + flag)  
2. **Package B:** Product Workspace header/overview (type, publish, preview, save state)  
3. **Package C:** Variant/price matrix (honest about Default-only + prices)  
4. **Package D:** Gallery workspace (hero/order/coverage; no second SoT)  
5. **Package E:** Promotion wizard with storefront-truthful preview  
6. **Package F:** Notifications consistency + dashboard links + custom entity screens  

No P0/P1 may remain open when starting the next package after the package that claims to fix them.
