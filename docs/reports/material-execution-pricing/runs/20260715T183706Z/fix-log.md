# Fix log

## 2026-07-15T18:37Z (Codex must-do from request-changes)
1. Added API E2E `api_qty2_unit_once` - quantity 2 keeps unit = round(base×0.7), multiplier 0.7 once
2. Responsive overflow now checks 1440 / 768 / 390 / 320
3. Runner verifies `dist/.../configured-line-item-pricing.js` exists and route.js references `resolveConfiguredLineItemPricing`
4. This run records final Codex review in `codex-review.md` (no `_pending_` placeholder after re-gate)
