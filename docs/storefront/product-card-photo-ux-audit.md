# Storefront Product-Card / Photo UX Audit

## Short Verdict

Storefront product-card/photo UX has a clear set of safe frontend polish opportunities, but media gaps for Oxford, Willie Winkie, and part of Monchelsea are intake/source blockers and must not be masked by frontend workarounds.

## Scope

- Product cards/tiles and catalog grids.
- PDP hero image, thumbnails, and gallery behavior.
- No-photo/fallback behavior.
- Price/name/metadata/collection labeling presentation.
- Responsive behavior and visual hierarchy.

## What Was Checked

- Governance/evidence inputs:
  - `docs/project/collection-asset-intake-pipeline.md`
  - `data/normalized/collection-asset-intake-summary.json`
  - `docs/content/collection-asset-intake-summary.md`
  - `data/raw/front/front-manifest.json` (legacy/front hint context)
- Storefront UI paths:
  - `apps/storefront/src/components/product-card.tsx`
  - `apps/storefront/src/components/oliver-product-media.tsx`
  - `apps/storefront/src/app/catalog/page.tsx`
  - `apps/storefront/src/app/kids/catalog/page.tsx`
  - `apps/storefront/src/app/bespoke/catalog/page.tsx`
  - `apps/storefront/src/app/product/[id]/page.tsx`
  - `apps/storefront/src/app/globals.css`
  - `apps/storefront/src/lib/product-metadata.ts`
  - `apps/storefront/src/lib/display-group.ts`

## What Was Not Changed

- No storefront runtime code.
- No backend code.
- No seed/ingestion run.
- No changes to `apps/storefront/src/lib/catalog-scope.ts`.
- No product/workbook/source data edits.
- No asset copy/rename/assignment.
- No stage promotion/publish action.

## Reference Baselines

- Greenwich and Oliver were used only as quality/reference baselines.
- They were not treated as rollout/publish targets in this pass.

## Audit Categories

- `card_layout`
- `image_ratio_and_crop`
- `thumbnail_consistency`
- `gallery_behavior`
- `fallback_no_photo_state`
- `price_and_metadata_display`
- `collection_labeling`
- `responsive_behavior`
- `visual_hierarchy`
- `source_asset_gap_not_frontend_bug`

## Findings Table

| ID | Category | Component Path | Frontend UI problem / asset quality problem / missing asset problem / source coverage problem / backend metadata problem / unknown | Issue | UX Impact | Root Cause | Fix Type | Risk |
|---|---|---|---|---|---|---|---|---|
| F-001 | card_layout | `apps/storefront/src/components/product-card.tsx` | frontend UI problem | Optional metadata rows create uneven card density in one grid. | Harder to compare products quickly. | frontend_ui | frontend_polish | medium |
| F-002 | image_ratio_and_crop | `apps/storefront/src/app/globals.css` | frontend UI problem | 4:5 cover framing can crop furniture edges in card/PDP contexts. | Shape readability drops on silhouette-sensitive items. | frontend_ui | frontend_polish | medium |
| F-003 | thumbnail_consistency | `apps/storefront/src/app/globals.css` | frontend UI problem | Thumbnail 1:1 crop differs from hero 4:5 crop framing. | Thumbnail preview can misrepresent hero composition. | frontend_ui | frontend_polish | low |
| F-004 | gallery_behavior | `apps/storefront/src/app/product/[id]/page.tsx` | frontend UI problem | PDP thumbnails are static and do not switch hero image. | Gallery appears non-functional vs user expectations. | frontend_ui | frontend_polish | medium |
| F-005 | thumbnail_consistency | `apps/storefront/src/app/product/[id]/page.tsx` | frontend UI problem | No active-state indicator for selected thumbnail. | Users lose orientation in multi-image sets. | frontend_ui | frontend_polish | low |
| F-006 | fallback_no_photo_state | `apps/storefront/src/components/product-card.tsx`; `apps/storefront/src/components/oliver-product-media.tsx`; `apps/storefront/src/app/product/[id]/page.tsx` | frontend UI problem | Oliver has explicit "Нет фото", non-Oliver uses silent placeholder/skeleton. | Inconsistent semantics look like random defects/loading. | frontend_ui | frontend_polish | medium |
| F-007 | price_and_metadata_display | `apps/storefront/src/components/product-card.tsx`; `apps/storefront/src/lib/display-group.ts` | backend metadata problem | "от" prefix ties to display-group collapse only. | Card-level price expectation may diverge from PDP semantics. | backend_metadata | backend_metadata_followup | medium |
| F-008 | collection_labeling | `apps/storefront/src/lib/product-metadata.ts`; `apps/storefront/src/components/product-card.tsx`; `apps/storefront/src/app/product/[id]/page.tsx` | backend metadata problem | Collection/subcollection cues disappear when metadata is incomplete. | Inconsistent taxonomy context across cards/PDP. | backend_metadata | backend_metadata_followup | medium |
| F-009 | responsive_behavior | `apps/storefront/src/app/globals.css` | frontend UI problem | `minmax(260px, 1fr)` grid can collapse abruptly near tablet widths. | Unstable visual rhythm on resize/orientation changes. | frontend_ui | frontend_polish | low |
| F-010 | visual_hierarchy | `apps/storefront/src/components/product-card.tsx`; `apps/storefront/src/app/globals.css` | frontend UI problem | Context line, dimensions, hint, and badge compete with title/price. | Primary decision cues become less dominant. | frontend_ui | frontend_polish | medium |
| F-011 | source_asset_gap_not_frontend_bug | evidence-level (`data/normalized/collection-asset-intake-summary.json`) | source coverage problem | Oxford and Willie Winkie are `hints_or_blocked_no_usable_base`. | Missing/weak media is intake/source debt, not rendering defect. | source_coverage | do_not_fix_in_frontend | high |
| F-012 | source_asset_gap_not_frontend_bug | evidence-level (`data/normalized/collection-asset-intake-summary.json`) | missing asset problem | Monchelsea has unresolved `manual_identity_review_required` + `disk_manifest_gap_candidate`. | Partial SKU photo inconsistency is expected until closure. | asset_missing | asset_pipeline_followup | high |

## Best-available Photo Coverage Policy

- Policy artifact: `docs/storefront/product-card-photo-coverage-policy.md`
- Candidate manifest artifact: `data/normalized/storefront-best-available-photo-candidates.json`
- Goal: reduce empty card-image states with controlled, evidence-backed temporary candidates when ideal white-background media is missing.
- Constraint: no runtime/frontend/backend mutation and no media assignment in this pass.

### Findings split by problem class

- Real frontend UI issues:
  - `F-001`, `F-002`, `F-003`, `F-004`, `F-005`, `F-006`, `F-009`, `F-010`
- Media coverage issues:
  - `F-012` (asset missing / partial coverage for Monchelsea)
- Source coverage issues:
  - `F-011` (Oxford/Willie Winkie intake state blocks auto-use)
- Backend metadata issues:
  - `F-007`, `F-008`

## Bugfix log: catalog + PDP gallery interactivity (2026-05)

| Field | Detail |
|-------|--------|
| **Root cause** | Catalog `ProductCard` rendered only `thumbnail` and ignored `images[]` (no client state). The card was a single `<Link>`, so any future thumb UI would fight navigation. PDP listed extra images as static `<img>` nodes and never updated the hero. |
| **Affected components** | `apps/storefront/src/components/product-card.tsx`, `product-card-gallery.tsx`, `product-pdp-gallery.tsx`, `apps/storefront/src/app/product/[id]/page.tsx`, `apps/storefront/src/lib/product-images.ts`, `apps/storefront/src/app/globals.css`. |
| **Fix type** | `frontend_polish` |
| **Not changed** | Backend / Medusa data model / seed / ingestion / product metadata / catalog-scope / rollout / evidence JSON; Oxford / Monchelsea / WW / Oliver governance artifacts. Oliver card/PDP paths unchanged (`OliverCardMedia` / `OliverHeroMedia`). |

Partially closes audit items **F-004**, **F-005** (PDP); catalog multi-image behavior was the same class of defect at card level.

### Follow-up: display_group listing vs Greenwich (2026-05)

| Field | Detail |
|-------|--------|
| **Working reference** | Greenwich bed `display_group`: every SKU carries the **same** full `images[]` from shared pool ingestion, so the collapsed representative already had `urls.length > 1` after the first UI fix. |
| **Regression / partial coverage cause** | `groupProductsForDisplay` kept only the **first** variant as `product` for the card. Other collections split gallery across size/SKU rows (thumbnail on rep, extra shots on siblings, or sparse `images` per row). Listing then saw a single URL while PDP/detail fetch could still differ. |
| **Affected** | `apps/storefront/src/lib/display-group.ts`, `apps/storefront/src/lib/product-images.ts` (`mergeProductImageUrlsFromMembers`, `normalizeImageEntryUrl`, `buildMergedImagesForDisplayGroup`), `apps/storefront/src/app/product/[id]/page.tsx` (PDP gallery uses the same merge over current product + `getDisplayGroupMembers`). |
| **Fix type** | `frontend_polish` |
| **Not changed** | Backend routes, Medusa records, seed/ingestion, product metadata writes, catalog-scope, evidence JSON, governance lanes. Oliver `ol-` branches unchanged. |

### Follow-up: broken `<img>` + resolver hardening (2026-05)

| Field | Detail |
|-------|--------|
| **Problem after merge** | Union of `display_group` URLs could include **relative** Medusa paths (`/uploads/...`, `/static/...`). The browser resolves those against the **storefront** origin (e.g. `:8000`), not Medusa → broken image icon. Merge could also surface empty/duplicate strings if API rows were sparse. |
| **Broken image root cause** | Missing or wrong **absolute** `src`: relative paths without `NEXT_PUBLIC_MEDUSA_BACKEND_URL` prefix; optional Docker-only hostname `medusa` in absolute URLs from SSR; `<img src="">` avoided but not all invalid strings were filtered before render. |
| **“Some cards still old”** | Oliver (`ol-`) intentionally uses `OliverCardMedia` (no multi-thumb strip). Other non-Oliver cards always use `collectProductImageUrls` → single vs gallery branch only by **resolved** URL count after sanitization. |
| **Fix type** | `frontend_polish` |
| **Resolver** | `resolveStorefrontImageSrc` in `product-images.ts`: trim, block dangerous protocols, prefix `/uploads/` and `/static/` with `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, rewrite `http://medusa:…` to public origin; `collectProductImageUrls` only emits resolved URLs; `gatherRawProductImageUrls` + script for diagnostics. |
| **Gallery** | `ProductCardGallery` / `ProductPdpGallery`: defensive `safeUrls`, index clamp on props change, no `<img>` when list empty (fallback via card/PDP parent). Oliver components resolve thumbnail through the same helper. |
| **Diagnostics** | `yarn diagnose:card-media` → `data/normalized/storefront-product-card-media-diagnostics.json` + `docs/storefront/product-card-media-diagnostics.md`. |
| **Asset pipeline follow-up** | Rows where raw API had URLs but **all** were rejected (malformed, unknown path shape, or 404 on server) stay out of `<img>`; fix is still operator/media/ingestion — not faked in frontend. |
| **Not changed** | Backend, Medusa data, seed, catalog-scope, evidence JSON, governance lanes. |

### Stabilization rollback: gallery / resolver regression (2026-05)

| Field | Detail |
|-------|--------|
| **Regression** | Follow-up gallery work + `resolveStorefrontImageSrc` / `collectProductImageUrls` on the card + `display_group` image merge caused **main hero** failures (empty or wrong `src` vs prior `thumbnail`-only behavior). |
| **Rollback (frontend only)** | **Catalog card:** non-Oliver hero is **only** `product.thumbnail` (trimmed); no `collectProductImageUrls` / no `ProductCardGallery` (component removed). No `<img>` without a non-empty string. **PDP:** hero is **only** `product.thumbnail`; removed interactive `ProductPdpGallery` (component removed) and static extra strip for this pass. **`display_group`:** representative is again `{ ...representative, title }` **without** overwriting `thumbnail` / `images`. **`product-images.ts`:** legacy raw list helper + merge for **diagnostics** only (no resolver). **Oliver:** `OliverCardMedia` / `OliverHeroMedia` again use passed `src` with `trim` + `onError` (no `resolveStorefrontImageSrc`). **CSS:** removed card gallery thumb + PDP thumb button rules. |
| **Temporarily disabled** | Card thumbnail strip, PDP interactive gallery, `images[]` as card hero, `display_group` media merge on listing. |
| **Follow-up** | Re-introduce multi-image UX only behind a **separate diagnostic task** once URL contract and env are verified end-to-end. |
| **Fix type** | `frontend_polish` (stabilization) |
| **Not changed** | Backend, Medusa data model, seed/ingestion, product metadata, catalog-scope, rollout, evidence JSON, Oxford / Monchelsea / WW / Oliver Kids governance. |

### Card extras restored without hero contract change (2026-05)

| Field | Detail |
|-------|--------|
| **Context** | Stabilization rollback made catalog cards **thumbnail-only** (no `images[]` on the card), so **extra photos disappeared** while the main image stayed tied to `product.thumbnail`. |
| **First restore pass** | **Extras** on the card from **`product.images[]` only** via `ProductCardMediaSwitcher` + `collectExtraProductImageUrls`. **Greenwich** looked good because the representative SKU already had a full `images[]`; many other **display_group** collections keep extra shots on **sibling SKUs**, so extras barely appeared outside Greenwich. **PDP** was unchanged in that pass (interactive gallery still off). |
| **Main image contract** | Non-Oliver hero = `product.thumbnail?.trim()`; empty → placeholder; hero is **not** sourced from `images[]`, not from `collectProductImageUrls`, and **`thumbnail` is not overwritten** by grouping. |
| **Safety (card)** | Thumbnail click **preloads**; hero swaps only after `onLoad`; broken extra hidden; hero `onError` → `mainSrc`; thumb does not navigate; hero link → PDP. |
| **Not changed** | Backend, Medusa, seed/ingestion, product metadata, catalog-scope, rollout, evidence JSON; Oliver branch unchanged. |

### Display group UI extras + PDP gallery (2026-05)

| Field | Detail |
|-------|--------|
| **Catalog grid** | `groupProductsForDisplay` adds **UI-only** `display_group_extra_image_urls` on the representative: union of all members’ `images[]` plus each member’s `thumbnail` when it **differs** from the representative thumbnail — via `collectDisplayGroupExtraImageUrls` (same URL rules as before: trim, dedupe, **no** `/uploads/` → `null`). **`thumbnail` / `images` on the representative object are not mutated.** |
| **ProductCard** | `extraSrcs = mergeUniqueExtraUrls(mainSrc, [collectExtraProductImageUrls(product, mainSrc), display_group_extra_image_urls ?? []])`. |
| **PDP** | `ProductPdpMediaSwitcher`: hero still **`product.thumbnail` only**; extras = `collectDisplayGroupExtraImageUrls([product, ...getDisplayGroupMembers], mainSrc)` after neighbors load — **no** data-model merge, **no** thumbnail rewrite. Same preload / broken-extra / hero-fallback behavior as the card switcher. |
| **Not changed** | Backend, catalog-scope, evidence JSON, governance lanes; Oxford / Monchelsea / WW / Oliver Kids governance; no resolver that nulls relative Medusa paths. |

### Catalog media diagnostics + bespoke grouping + Oliver extras (2026-05)

| Field | Detail |
|-------|--------|
| **Greenwich** | Подтверждённо рабочий reference: пайплайн `/catalog` + `groupProductsForDisplay` + `ProductCard` **не менялся по смыслу**; добавлена только диагностика и исправление путей ниже. |
| **Почему у других non-Oliver мало extras** | (1) **`/bespoke/catalog` раньше не вызывал `groupProductsForDisplay`** — карточки не получали `display_group_extra_image_urls`, хотя соседние SKU в Store есть → **`frontend_polish`**: та же группировка, что на `/catalog`. (2) Коллекции **`provence`** и **`country-london-paris`** в **`catalog-scope.ts`** в **`PAUSED_COLLECTION_KEYS`** — на **`/catalog`** и bespoke-фильтре они **не показываются**; отсутствие extras на витрине при этом **не баг фронта** — смотреть paused / env. (3) Если в Store у всех членов группы пустые **`images[]`** и нет отличных **`thumbnail`** → **`asset_pipeline_followup`**, карточка с одним thumbnail остаётся корректной. |
| **Oliver** | Раньше extras намеренно отключались (`extraSrcs = []`). Теперь **`OliverCardMediaSwitcher`** / **`OliverPdpMediaSwitcher`**: тот же контракт hero (`thumbnail`), extras только при наличии URL в данных, preload/onLoad, «Нет фото» при пустом/битом hero. Если в API нет доп. кадров — визуально как раньше (одна картинка). |
| **Диагностика** | Read-only **`/qa/catalog-media-debug`**: таблицы по пайплайну `/catalog`, bespoke grouped vs ungrouped (симуляция `members_not_loaded`), примеры товаров **вне** `isProductInActiveCatalogScope`. Логика: `apps/storefront/src/lib/catalog-media-debug.ts`. |
| **Fix type** | `frontend_polish` (bespoke listing + Oliver UI + QA страница). |
| **Not changed** | Backend, Medusa, seed/ingestion, metadata, файл `catalog-scope.ts`, rollout, evidence JSON, governance artifacts. |

### Broken extras stabilization + QA watch handles (2026-05)

| Field | Detail |
|-------|--------|
| **QA finding** | Greenwich остаётся OK; Oliver улучшен; на ряде Country / CO-* карточках в полоске и при переключении оставались **broken `<img>`** (часто относительные `/uploads/` / `/static/` на origin витрины, 404, или несуществующие файлы в Medusa). |
| **Root cause (категории)** | **`frontend_polish`**: полоска рендерила `src` до проверки загрузки; часть URL — мусорные строки; статически подозрительные пути классифицируются в `extra-url-diagnose.ts` (read-only). **`asset_pipeline_followup`**: в Store записаны пути без реального файла или без отдачи с текущего backend — чинится ingestion/materialize, **не** в этом шаге. |
| **Что сделано (UI)** | `filterObviousGarbageImageUrl` + применение в `collectExtra*`, `mergeUniqueExtraUrls`; **`filterExtrasBySuccessfulImageLoad`** + **`useVerifiedStripExtras`** — в полоске только URL, прошедшие `Image()` onload; cap 12 URL на карточку; preload/hero `onError` без изменений. Те же хуки на **Oliver** card/PDP switchers. |
| **Диагностика** | Секция **Broken extras candidates** на **`/qa/catalog-media-debug`**: watch handles `co-02-1`, `co-15-2`, `co-05-1`, `co-61-1` + JSON с raw preview `images[]`, членами группы, `final_extra_srcs`, статической классификацией по URL. |
| **Commit** | Не считать финальным media-fix, пока вручную не подтверждено **отсутствие видимых broken images** после этого pass. |
| **Not changed** | Backend, seed/ingestion, metadata, `catalog-scope.ts`, evidence JSON. |

## Safe Next Steps

Implementation pass only for safe UI-polish findings:

1. `F-004`, `F-005` (interactive PDP gallery + active thumbnail state)
2. `F-006` (unified no-photo fallback semantics)
3. `F-001`, `F-010` (card hierarchy and density)
4. Then `F-003`, `F-009`, `F-002`

Keep `F-011` and `F-012` in asset intake/governance lane.

## Forbidden Fixes

- No frontend hacks to hide source/workbook/disk coverage gaps.
- No collection-specific fake placeholder strategy to simulate media readiness.
- No `catalog-scope.ts` edits to "hide" blocked collections.
- No asset assignment/copy/rename as production-ready in this pass.
- No stage promotion/publish decisions from UI symptoms alone.

## Controlled Visual Asset Triage Baseline (new)

- Policy artifact: `docs/project/visual-asset-source-priority-policy.md`
- Candidate manifest: `data/normalized/visual-asset-candidate-manifest.json`
- Backlog extension: `data/normalized/storefront-product-card-photo-ux-backlog.json` (`visual_assignment_triage`)

### Primary image policy (UX-safe)

1. `white_background_confirmed`
2. `non_white_usable`
3. `legacy_reference_fallback`
4. `missing_visual` -> AI/manual follow-up only

This ordering is evidence-first and does not imply production media readiness.

### Collection-aware triage snapshot

- Oxford: pilot-four only has usable interim non-white candidates (confirmed identity), white-background still absent.
- Monchelsea: partial legacy fallback exists but unresolved tail remains under manual identity review.
- Willie Winkie: blocked by source/business gate (painting semantics), no safe auto-fallback.
- Oliver Kids related: selective backfill reference track; fallback candidates require reviewer confirmation.

### Oxford-4 mini-summary (interim only, not white-background validated)

| SKU | Handle | Usable source now | White background present | Interim non-white candidate | Confidence | Allowed label |
|---|---|---|---|---|---|---|
| `OX-14-11` | `ox-14-11` | yes | no | `.../ox-14-11_interim_pdf_gallery_01.png` | confirmed | `interim_card_or_yandex_source` |
| `OX-90-1` | `ox-90-1` | yes | no | `.../ox-90-1_interim_pdf_gallery_01.png` | confirmed | `interim_card_or_yandex_source` |
| `OX-14-1` | `ox-14-1` | yes | no | `.../ox-14-1_interim_pdf_gallery_01.png` | confirmed | `interim_card_or_yandex_source` |
| `S-OX-05` | `s-ox-05` | yes | no | `.../s-ox-05_interim_pdf_gallery_01.png` | confirmed | `interim_card_or_yandex_source` |

### Explicit non-readiness statement

- `usable_for_card_now` is not equal to `media-ready/storefront-ready`.
- Interim fallback does not close source-quality debt.
- Missing/ambiguous rows remain blocked until reviewer and/or AI follow-up closure.
