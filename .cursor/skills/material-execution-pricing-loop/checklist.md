# Material execution pricing - exhaustion checklist

Use after each LOOP cycle. Task is exhausted only when all boxes are true.

## Gates

- [ ] `yarn node --import tsx --test src/lib/configured-line-item-pricing.test.ts` exit 0
- [ ] `bash scripts/material-execution-pricing-loop.sh` exit 0 (or documented BLOCKED)
- [ ] Backend `:9000` health 200 with dist containing `resolveConfiguredLineItemPricing` (runner verifies)
- [ ] Storefront `:3002` up for browser E2E

## Product / API

- [ ] B1: omit `material_execution_code` with tiers → `400 MATERIAL_EXECUTION_REQUIRED`
- [ ] Unknown material / finish → 400
- [ ] LDSP unit = `round(base × 0.7)`; client labels/multipliers overwritten
- [ ] Full solid resolves to base
- [ ] LDSP + premium finish = `round(base × 0.7 × 1.05)` (single round)
- [ ] Quantity multiplies unit once (no double material discount)

## UI

- [ ] PDP dropdown «Исполнение» default LDSP; switch updates price
- [ ] Combobox a11y: role, aria-expanded, options, Escape/outside
- [ ] Cart shows `Исполнение: …` from server label
- [ ] Bespoke URL preserves `material=`; form present
- [ ] 320–1440: no horizontal scroll on PDP

## Codex / git

- [ ] Codex `must-do: []`
- [ ] Codex gate `safe_to_commit` (if committing)
- [ ] Staged pathspecs only; no `git add -A`
- [ ] Artifacts under `docs/reports/material-execution-pricing/runs/<UTC>/`
