# Legacy media board — rules sync (QA only)

Dev-only **preview / apply** for aligning all variant galleries with current board rules. Does **not** touch Medusa, seed, catalog-scope, evidence JSON, or production assignment.

## Rules applied (in order)

1. **Product/SKU identity** (`suggestion-product-guard.ts`) — `this_sku` / `needs_identity_review` / `excluded`. Color token alone is not enough. Other SKU → excluded. Weak / collection-only / ambiguous Oxford `Oxford_full_p*` or Monchelsea `Monchelsea_p*` PDF crops → `needs_identity_review` (not safe bulk assign).

2. **Color grouping** — filename token + handle/SKU path signals.

3. **Visual-role dedupe** (`legacy-media-variant-gallery-build.ts`) — one representative per role; extra front/hero near-duplicates hidden (`+N похожих скрыто`), not added to gallery.

4. **Same-SKU borrowing** — missing `interior` / `detail` / `lifestyle` / `scheme` only, same handle/SKU, never primary/hero from another color.

5. **Primary + gallery order** — `hero_front` → `front_anfas` → `interior` → `detail` → `lifestyle` → `scheme`.

## Protected (never overwritten silently)

| Field | Condition |
|-------|-----------|
| Gallery order | `galleryOrderLocked`, `galleryOrderSource` manual/recommended, confirmed/edited meta |
| Label | `labelEditedByUser` or `labelStatus: user_edited` (e.g. Молочный vs Кремовый token) |
| Primary | `primaryManualOverride` |

Sync **preview** always shows current → proposed. **Apply safe** skips variants with protected manual gallery order (may still update primary if not manual). **Apply all** respects label/primary protections.

## UI

On the review canvas: **Синхронизировать по правилам** → sync panel with counts, per-variant diff, Apply safe / Apply all (current product or visible collection).

Writes only to QA `localStorage` (`variants-v1`, zones mirror for active variant). Export shape unchanged; `galleryOrderSource: "rules"` is QA-only and not exported.

## Headless script

```bash
cd apps/storefront
node scripts/legacy-board-sync-preview.mjs
```

Writes `tmp/qa-screenshots/legacy-board-sync-preview.json` (untracked). User-edited labels in browser LS are **not** visible in clean headless — run preview in your browser for Молочный/Голочный checks.

## Module

`apps/storefront/src/app/qa/legacy-media-assignment-board/legacy-board-sync-rules.ts` — `buildBoardSyncPlan`, `buildSuggestedVariantsForProductSync`, `applyProductSyncPlan`.
