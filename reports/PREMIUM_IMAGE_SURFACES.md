# PREMIUM IMAGE SURFACES — inventory

**Branch:** `fix/premium-home-image-originals-20260723`  
**Base:** `origin/main` @ `45efa3f` (includes runtime lineage through `ad6ab49`)  
**Option:** B only (source selection; no generator / quality / width changes)

## Pipeline map (unchanged storage)

```text
ORIGINAL (/product-static/products/…)
  → resolveHomeImageSrc(surface)
       CATALOG_CARD + flag=1 → derivatives/card/*.webp (720/q78)
       premium surfaces      → ORIGINAL (unchanged)
  → HomeImg <img src> (+ onError fallback for card surfaces)
```

## Call-site map

| Surface | Component / resolver | Before (Phase H4 home) | After (Option B) |
|---------|----------------------|------------------------|------------------|
| HOME_HERO | `home-hero-slideshow.tsx` via `HomeHero` | card WebP | **original** (`surface=HOME_HERO`) |
| KIDS_HERO | `home-hero-slideshow.tsx` via `KidsHero` | card WebP | **original** (`surface=KIDS_HERO`) |
| ROOM_COMPOSITION | `page.tsx` `buildScenes` + `home-room-scene.tsx` | card WebP | **original** |
| LIFESTYLE_BLOCK | `home-entries`, `home-craft`, `home-project` | card WebP | **original** |
| LARGE_CTA | `home-final.tsx` | card WebP | **original** |
| CATALOG_CARD | `home-data` / `home-classics` / `home-deferred-card-layers` / `home-kids` product thumbs / `page` variantImgs | card WebP | **card WebP** (unchanged) |
| Kids entries/paint | raw `<img>` (never HomeImg) | original | original |
| Kids final | no photo | n/a | n/a |
| PDP | `product-images` / gallery | original | original (untouched) |
| Catalog PLP | `product-card` → `resolveCatalogCardHeroSrc` | card WebP | card WebP (untouched) |

## Core modules

- `apps/storefront/src/components/home/home-image.ts` — surface contract + resolver
- `apps/storefront/src/components/home/home-img.tsx` — client `<img>` + `surface` prop
- `apps/storefront/src/lib/catalog-card-image.ts` — **unchanged** card derivative logic / generator contract

## Explicit non-touch

- `apps/backend/scripts/generate-catalog-card-derivatives.ts`
- CARD_WIDTH / QUALITY
- PDP gallery resolvers
- Catalog product-card pipeline
