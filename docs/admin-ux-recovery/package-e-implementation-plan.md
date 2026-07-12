# Package E — Promotions Workspace: implementation plan

**Date:** 2026-07-12 (MSK)
**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration`
**Branch:** `feat/admin-ux-recovery-integration-20260712`
**Flag:** everything behind `WOODRIGHT_ADMIN_UX_V1` (env / localStorage / `window.__WOODRIGHT_ADMIN_UX_V1__`).
**Contract:** `package-e-promotion-contract.md` (Medusa 2.13.3, installed packages = source of truth).

## Scope (Commit-1 + Commit-2 foundations)

Woodright promotions workspace: list, detail, create wizard, product tab
«Продвижение», widget entry, error catalog extension. All operator copy in
Russian; no raw `application_method` / `target_rules` labels in primary text.
Create defaults to `draft`; disable = `status: inactive` (never delete).
No storefront changes, no migrations, no custom discount engine.

## Supported vs fallback matrix

| Capability | Woodright UI | Fallback |
|------------|--------------|----------|
| Percentage discount (0 < n ≤ 100) | **Supported** (create, view, edit value) | — |
| Fixed RUB discount (major units) | **Supported** (+ mirrored `currency_code eq rub` condition rule) | — |
| Code promotion | **Supported** | — |
| Automatic promotion (`is_automatic`, code still required) | **Supported** | — |
| Target: whole order | **Supported** (`target_type: order`, no allocation) | — |
| Target: products (`items.product.id in`) | **Supported** (allocation `across`, no `max_quantity`) | — |
| Target: collections (`items.product.collection_id in`) | **Supported** | — |
| Exclusions (per-id `items.product.id ne` rules, AND semantics) | **Supported** in wizard | — |
| Campaign: select existing (`campaign_id`) | **Supported** (+ client compatibility check: spend currency, dates, budget) | — |
| Campaign: create inline (nested `campaign` in create payload) | **Fail-closed** — create in stock Admin `/app/campaigns`, then select | Stock Admin |
| Disable / enable (status `inactive` / `active`) | **Supported** with confirm | — |
| Edit discount value (stale-fingerprint check before write) | **Supported** | Stock Admin for everything else |
| Delete promotion | **Not in Woodright** (hard delete via workflow) | Stock Admin |
| Buy X Get Y (`buyget`) | **Fallback** until live smoke | Stock Admin `/app/promotions` |
| Free shipping (percentage 100 on `shipping_methods`) | **Fallback** until shipping path proven; detected and labeled honestly | Stock Admin |
| Variant-level targeting | **Fail-closed** (not in official attribute map) — UI says «выберите товар целиком» | Product-level targeting |
| Categories / tags / Medusa product type targets | **Read-only** (described in detail view) | Stock Admin to create/edit |
| Condition rules (customer group, region, country, sales channel) | **Read-only** (described) | Stock Admin |
| Unknown attributes / operators / types / statuses | **Fail-closed** with reason + Stock Admin link | Stock Admin |
| Cart verification (Store API, explicit promo-code apply) | **Supported** with publishable key; honest `unknown` attribution | Manual storefront check |
| Automatic-promotion cart verification | **Fail-closed / documented** (postinstall patch removes auto-apply, Medusa #14149) | Manual QA on isolated DB |

## Files

### Library `apps/backend/src/admin/lib/promotions/`

| File | Purpose |
|------|---------|
| `types.ts` | DTOs mirroring Admin REST responses + rule value normalizers |
| `amount.ts` (+ test) | Fixed major-unit / percent parsers; empty ≠ 0; Russian error copy |
| `status.ts` (+ test) | Human status VM: draft/inactive/active/scheduled/expired/budget_exhausted/usage_exhausted/invalid/unknown |
| `summary.ts` (+ test) | One-line RU summaries; no raw enum leakage; fixed-price honesty note |
| `rules.ts` (+ test) | Proven attribute/operator catalog; fail-closed classification |
| `impact.ts` (+ test) | Preliminary impact estimate (exact_list / depends_on_catalog / whole_order / unknown) |
| `intersection.ts` (+ test) | exact / possible / no-overlap-known / unknown; never claims stacking |
| `fingerprint.ts` (+ test) | Stale-edit fingerprint + refetch check |
| `payload.ts` (+ test) | `AdminCreatePromotion` builder for supported wizard shapes; validation in RU |
| `campaign.ts` (+ test) | Budget/currency/date compatibility + `describeCampaign` |
| `cart-result.ts` (+ test) | Adjustment→code attribution; ambiguous → `unknown` |
| `partial-failure.ts` (+ test) | Multi-step operation summaries (all_ok/partial/all_failed/nothing_ran) |
| `api.ts` | Admin fetch helpers (relative `/admin/...`, `credentials: include`) |
| `store-cart-api.ts` | Store cart helpers (`x-publishable-api-key`; fail-closed when key missing) |
| `ProductPromotionsPanel.tsx` | «Продвижение» tab: direct/indirect matches, bounded pagination |

### Routes / widgets

| File | Purpose |
|------|---------|
| `routes/woodright/promotions/page.tsx` | List: filters (все/действуют/запланированы/завершены/внимание/по кампаниям), human columns, create, Stock Admin link |
| `routes/woodright/promotions/[id]/page.tsx` | Detail: summary, status, targets, campaign, impact, edit value, disable/enable, cart verify, technical details |
| `routes/woodright/promotions/new/page.tsx` | Wizard: скидка → код/автомат → область → исключения → кампания/даты → проверка; `?product_id=` preselect |
| `widgets/promotions-woodright-entry.tsx` | Entry on `promotion.list.before` (flag-gated) |
| `routes/woodright/products/[id]/page.tsx` | Promotions tab wired to `ProductPromotionsPanel` |

### Errors

`lib/errors/normalize-admin-error.ts` extended with: `duplicate_promo_code`,
`invalid_promotion_type`, `invalid_promotion_value`, `promotion_unsupported`,
`campaign_budget_conflict`, `publishable_key_missing`,
`cart_verification_failed`, `promo_code_not_applied` (+ server-code and
raw-message mappings, + tests).

## Design decisions

- **Amounts:** fixed promotion `value` = major RUB units, whole rubles only;
  percent allows fractions. No ×100 kopeck assumption (contract E3).
- **Exclusions:** one `ne` rule per excluded id (AND semantics are proven);
  multi-value `ne` semantics are not — avoided.
- **Fixed + currency:** `currency_code` on application method **and** a
  mirrored `currency_code eq` condition rule so the promotion never applies to
  carts in another currency.
- **Allocation:** `across` for items targets (no `max_quantity` needed);
  omitted for order target.
- **Status:** no activate endpoint; toggle via update `status`. Delete stays
  in stock Admin.
- **Stale edits:** refetch + fingerprint compare before any update write.
- **Detail/new routes** export no `defineRouteConfig`: the SDK `nested` union
  only allows stock paths; routes stay reachable via list/product links.
- **Cart verification:** explicit `POST /store/carts/:id/promotions` only;
  empty `promo_codes` refused client-side (REPLACE semantics). Patch
  `patch-skip-cart-promotions.mjs` (#14149) documented in UI honesty note.

## Validation state

- Unit: `node --experimental-strip-types --test 'src/admin/lib/promotions/**/*.test.ts' 'src/admin/lib/errors/normalize-admin-error.test.ts'` — **131/131 pass** (2026-07-12).
- `tsc --noEmit`: no new substantive errors in Package E files; remaining
  classes (window/JSX/import.meta/.ts-ext, widget `id`) pre-exist across
  Package B/C/D admin files (admin UI builds via Vite).
- Browser QA, live fixtures on `medusa-admin-ux-b5` (`:9001`), inline-campaign
  and cart-verification smoke: **not run yet** (parent-owned).

## Open blockers / risks

1. **Publishable key:** admin bundle cannot read
   `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`; verification asks the operator for a
   key (param / `window.__WOODRIGHT_STORE_PUBLISHABLE_KEY__` / localStorage
   `WOODRIGHT_STORE_PUBLISHABLE_KEY`), fail-closed otherwise.
2. **#14149 patch:** explicit promo-apply endpoint may still fail when
   automatic promotions exist — needs `:9001` smoke before trusting verify UI.
3. **Nested `campaign` create payload:** schema-supported, live roundtrip
   pending.
4. **`rule-value-options` labels:** wizard search assumes `{label, value}`
   items; verify shape on live API.
5. List filters/statuses compute per loaded page (50) — documented in UI.
