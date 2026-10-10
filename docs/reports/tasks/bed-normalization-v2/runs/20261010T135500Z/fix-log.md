# Fix log

1. Added `getMattressSize`. Variant value wins. Body dimensions are not a source. Mismatched key or display returns null.
2. PDP spec row uses that value and `formatRuInline`. Label is `Размер спального места`.
3. `groupProductsForDisplay` does not collapse a size-axis group whose titles disagree on footboard, fabric, lift, transformer, side crib, or mattress-not-included.
4. Local metadata only: four Provence beds moved from `pv-15-16-bed` to `pv-15-bed` / `pv-16-bed`. Titles, prices, and mattress keys stayed. `PV-16` group title is the plain 140 product title so the 120 label is not reused.
5. If the selected variant has a mattress_size bag that is unknown or inconsistent, the PDP does not fall back to the product bag.
