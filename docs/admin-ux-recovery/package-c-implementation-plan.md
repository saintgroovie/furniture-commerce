# Package C — implementation plan

## Goal

Operator-facing **Варианты и цены** matrix inside Product Workspace, SoT = Medusa 2.13.3 Admin APIs.

## Architecture

```
page.tsx (tab variants)
  └─ VariantsPricesPanel
       ├─ buildVariantMatrix(product, classification)  // pure
       ├─ filter/sort/search (local)
       ├─ validateVariantRows (pure)
       ├─ price input adapter (pure + tests)
       ├─ row editors → POST /admin/products/:id/variants/:vid
       └─ bulk preview → sequential limited updates + report
```

## Phases

### P1 — Read matrix (commit 1)

- Expand product fields for options + variant options + prices.
- View models: option columns, Default compact mode, classification banners.
- Search / filters / sort / empty states.
- Validation indicators (read-only).
- Stock Admin fallback link.
- Unit tests.

### P2 — Safe edit (commit 2)

- SKU inline edit + cancel.
- Simple price edit/add for empty `rules` + null min/max.
- Complex price → fallback only.
- Integrate dirty state with Workspace unsaved guard.
- Error normalizer mappings.
- Integration smoke against isolated DB.

### P3 — Bulk (commit 3, if safe)

- Selected-rows only.
- Fixed amount / percent / set absolute for one currency.
- Preview ranges + skip reasons.
- Partial failure report.
- Concurrency limit (e.g. 3).

### P4 — Docs + browser QA (commit 4)

- Operator notes, validation doc.
- Playwright DOM scenarios + Package B regression.

## Risks

| Risk | Mitigation |
|------|------------|
| Amount unit mistake | Fixture-proven major units; parser/formatter tests |
| Accidental price delete | Proven: `prices` is **full replacement**; always resend preserved prices by id; never send `[]`; omit `prices` for SKU-only |
| Overwriting rule prices | Detect rules/min/max/duplicate-currency; block all price edits on that variant |
| Multi-currency wipe | Explicit currency picker; rebuild full payload |
| Bulk silent partial | Explicit success/fail lists; sequential queue (concurrency 1 default, max 3) |
| N+1 | Single product fetch; no catalog scan |
| Fixture poverty | Isolated seed for multi-option + multi-currency + complex; synthetic 50+ for UI |

## Price payload builder (required)

```ts
buildVariantPricesPayload({
  existingPrices,
  change: { currency_code, amount, mode: "update" | "add" }
}) → AdminPriceInput[] | { error: "blocked_complex" | "currency_ambiguous" | ... }
```

Acceptance: unit tests prove untouched currencies survive; complex variants never produce a prices payload.

## Out of scope

Gallery, promotions, inventory editor, CSV, option constructor, Medusa upgrade.
