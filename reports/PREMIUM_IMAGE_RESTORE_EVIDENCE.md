# PREMIUM IMAGE RESTORE EVIDENCE (Option B)

**Date:** 2026-07-23  
**Runtime mutations:** NONE (staging still serves pre-PR HTML)  
**Candidate:** branch `fix/premium-home-image-originals-20260723`

## Method honesty

| Layer | Status |
|-------|--------|
| BEFORE live HTML on `woodright-demo.ru` | Measured this turn |
| AFTER live HTML | **Not available** until deploy - proven via resolver fidelity + measured original bytes |
| Visual zooms BEFORE | From audit cycle `/tmp/woodright-image-quality-audit-20260723-083558/visual/` |
| Visual AFTER on live | Deferred to post-deploy QA |

## HOME

| Asset | Role | BEFORE loaded | BEFORE bytes / WxH | AFTER source (code) | AFTER bytes / WxH |
|-------|------|---------------|--------------------|---------------------|-------------------|
| wideheader View01 | HOME_HERO + LARGE_CTA | `…/derivatives/card/….webp` | 39 232 / 720×480 | original `.jpg` | 278 017 / 1800×1200 |
| cloud bedroom View01 | HOME_HERO | card webp | 36 382 / 720×450 | original | 190 654 / 1600×1000 |
| frame var2 View03 | HOME_HERO | card webp | 30 418 / 720×480 | original | 173 714 / 1500×1000 |
| cloud View04 | ROOM_COMPOSITION | card webp | 34 668 / 720×450 | original | 207 079 / 1600×1000 |
| frame View01 | ROOM_COMPOSITION | card webp | 32 374 / 720×480 | original | 167 610 / 1500×1000 |

**Visual observations (BEFORE, proven):** soft fabric, banding, Retina upsample ~4–5× (`hero-deriv-zoom.jpg` vs `hero-orig-zoom.jpg`).  
**AFTER expectation:** full native resolution; micro-contrast restored for premium interiors.

Live BEFORE: `home_has_hero_deriv=true`, page image URLs n=51 of which derivatives=33.

## KIDS

| Asset | Role | BEFORE | AFTER |
|-------|------|--------|-------|
| OL-95 gallery_02 | KIDS_HERO | card webp 6 912 / 720×720 | original 31 188 / 1000×1000 |
| OL-85 gallery_01 | KIDS_HERO | card webp 15 786 / 720×720 | original 67 465 / 1000×1000 |

Kids entries/paint already used raw `<img>` originals (unchanged).

Live BEFORE: kids deriv_count=5 / 23 URLs.

## ROOMS (home compositions)

Interactive room scenes are the proven room composition path (`HomeRoomScene`).  
Route `/rooms` SSR previously showed 0 product-static in audit scrape - not the Option B target; home compositions covered.

## Catalog / PDP guard (BEFORE live, AFTER code)

| Page | BEFORE deriv | AFTER expectation |
|------|--------------|-------------------|
| Catalog | 69 / 134 | **unchanged** (product-card path untouched) |
| PDP sample | 0 / 5 | **unchanged** |

## Fidelity gates

```text
premium-image-surface.fidelity.test.ts: ok
home-image.fidelity.test.ts: ok
catalog-card-image.fidelity.test.ts: ok
```
