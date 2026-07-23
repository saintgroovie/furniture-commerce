# IMAGE_RESTORE_REVIEW — PR #82

**Branch:** `fix/premium-home-image-originals-20260723` @ `511b250`  
**Scope:** Option B only (premium home/kids surfaces → originals; catalog cards keep H4)

## Surface contract table

| Surface | Before (live staging) | After (PR #82) | Expected |
|---------|----------------------|----------------|----------|
| HOME_HERO | card WebP 720/q78 | **original** | original |
| KIDS_HERO | card WebP 720/q78 | **original** | original |
| ROOM_COMPOSITION | card WebP 720/q78 | **original** | original |
| LIFESTYLE_BLOCK | card WebP 720/q78 | **original** | original |
| LARGE_CTA | card WebP 720/q78 | **original** | original |
| CATALOG_CARD | card WebP 720/q78 | **card WebP 720/q78** | card WebP |

## Invariant checks

| Check | Result |
|-------|--------|
| Generator unchanged | PASS (not in PR file list) |
| `catalog-card-image.ts` unchanged | PASS |
| PDP image pipeline unchanged | PASS |
| Default `HomeImg` surface = `CATALOG_CARD` | PASS |
| `toHomeProduct` / classics / deferred layers stay on default | PASS |
| Premium call sites set explicit surfaces | PASS |
| onError fallback retained for card surfaces | PASS |
| SSR: `resolveHomeImageSrc` pure string rewrite | PASS |
| Hydration: preferred URL derived from props; `useEffect` syncs | PASS |

## Review areas

### Surface contract correctness
Premium surfaces short-circuit to trimmed original path when listed in `PREMIUM_ORIGINAL_SURFACES`. Catalog cards still call `resolveCatalogCardHeroSrc` under flag=1.

### Accidental catalog regressions
None found. Catalog PLP uses `product-card` → `resolveCatalogCardHeroSrc`, not `resolveHomeImageSrc`. Home featured cards keep default `CATALOG_CARD`.

### Accidental PDP regressions
None. PDP does not import `home-image` / `HomeImg`.

### SSR / hydration / loading safety
- Server HTML for premium scenes uses originals via `page.tsx` `buildScenes`.
- Hero still delays extra slides (`extrasReady`) - unchanged.
- `fetchPriority=high` retained on slide 0.
- Card onError → original recovery path unchanged.

## Local validation (this cycle)

| Gate | Result |
|------|--------|
| premium-image-surface.fidelity | PASS |
| home-image.fidelity | PASS |
| catalog-card-image.fidelity | PASS |
| lint | PASS (exit 0; pre-existing `<img>` warnings) |
| typecheck | PASS |
| build | (see cycle log) |
| PR CI checks | SUCCESS (Storefront production gates, Backend fidelity, Release governance) |

## Verdict

**approve**

No `request_changes`. Safe to merge and proceed to storefront-only staging deploy.
