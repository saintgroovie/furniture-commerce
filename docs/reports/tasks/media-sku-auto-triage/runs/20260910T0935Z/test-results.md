# Test results - 20260910T0935Z

## triage-v2
- products 108
- ship_now 94
- hold 14 (13 CLP + ol-05-н)
- self-check P0/P1: all ok

## Dry-run (`SHIP_NOW_TRIAGE_DRY_RUN=1`)
- After static-filename fallback: **94 SKU, skipped 0, missing files 2**
- `ol-84-1`: thumb + 2
- Evidence: `evidence/dry-run-summary.txt`

## Apply (local `:9000` / `medusa-store`)
- `SHIP_NOW_TRIAGE_CONFIRM=1` `npx medusa exec ./src/scripts/apply-ship-now-v2board.ts`
- Result: **94 SKU updated; skipped 0; missing files 2**
- `ol-84-1` live: `OL-84-1_main.jpg` + `ol-84-1-i2.jpg` (no `gallery_01`)
- `ol-05-1`: `_main` + `i2` + `gallery_01`
- `pv-05-2`: `_main` + `i2` + `gallery_01`
- `co-02-1` unchanged (CLP hold)
- Evidence: `evidence/apply-summary.txt`

## verify:media-gallery
- Command: runtime `tsx` + canonical `scripts/verify-product-media-gallery.ts --live --handles ol-84-1,ol-05-1,ol-25-1,pv-05-2,av-05-1`
- Result: **VERIFY OK** P1=0 P2=0; live ok=`ol-84-1,av-05-1`
- Canonical wrote `docs/storefront/media-gallery-verify-latest.md` (not in this commit pathspec)
