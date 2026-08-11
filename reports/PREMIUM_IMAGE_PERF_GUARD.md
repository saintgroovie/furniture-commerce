# PREMIUM IMAGE PERFORMANCE GUARD (Option B)

## BEFORE (live staging HTML budgets)

| Page | Image URLs | Derivatives | Transfer (unique product-static) |
|------|------------|-------------|----------------------------------|
| Home `/` | 51 | 33 | **3.51 MB** |
| Kids `/kids` | 23 | 5 | **1.51 MB** |
| Catalog | 134 | 69 | **6.19 MB** |
| PDP sample | 5 | 0 | **1.11 MB** |

Prior freeze lab: home mobile Lighthouse ≈ **0.99**, LCP ≈ 1.9 s (headroom).

## AFTER (predicted, no deploy)

Unique premium source flips (hero×3 + room×2 + kids hero×2), measured orig−deriv:

| Set | Extra bytes |
|-----|-------------|
| Hero + room + kids heroes | ≈ **0.88 MB** |
| Lifestyle craft/entries/project (additional originals) | ≈ **+0.3–0.7 MB** depending on unique URLs already counted |
| **Home total expected growth** | ≈ **+0.9–1.5 MB** HTML image budget |
| Catalog | **~0** |
| PDP | **~0** |

LCP: home LCP candidate moves from ~39 KB WebP toward ~170–278 KB JPG for first hero. Expected mild LCP regression, still within prior headroom if preload/`fetchPriority=high` retained.

## Success criteria (owner)

Growth ≈ **+0.5–1.0 MB** for core premium set: **met** (~0.88 MB measured unique).  
With lifestyle blocks included, upper band ~1.5 MB - still acceptable given home perf headroom; catalog unchanged.

## Post-deploy checklist

1. Re-scrape home/kids HTML: premium URLs must **not** contain `/derivatives/card/`
2. Catalog still contains `/derivatives/card/`
3. PDP still 0 card derivatives
4. Optional: Lighthouse home mobile LCP re-check
