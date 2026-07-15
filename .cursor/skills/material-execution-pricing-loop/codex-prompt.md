# Codex prompt - material execution pricing LOOP

Copy into MCP `user-codex-woodright-reviewer` / tool `codex` (`sandbox: read-only`, `approval-policy: never`).

Replace bracketed sections with real paths from the latest run.

```text
Woodright independent review (read-only): material-execution × finish premium pricing LOOP.

## Goal
Confirm pricing SoT is sound: A1 (calculated_price only), B1 (material code required when tiers exist), single-round material×color, server rewrites labels/multipliers, PDP/cart/BESPOKE wiring, and that residual must-do is empty.

## Inputs (read these)
- .cursor/skills/material-execution-pricing-loop/SKILL.md
- docs/reports/material-execution-pricing/latest.md
- docs/reports/material-execution-pricing/runs/[UTC]/baseline.md
- docs/reports/material-execution-pricing/runs/[UTC]/test-results.md
- docs/reports/material-execution-pricing/runs/[UTC]/fix-log.md
- apps/backend/src/lib/configured-line-item-pricing.ts
- apps/backend/src/lib/configured-line-item-pricing.test.ts
- apps/backend/src/api/store/carts/[id]/line-items/route.ts
- apps/backend/src/lib/material-tier-contract.ts
- apps/backend/src/lib/finish-color-premium-contract.ts
- apps/storefront/scripts/e2e-material-execution-pricing.cjs
- apps/storefront/src/components/product-cta.tsx (metadata send only)

## Invariants
- Medusa backend = SoT; no client-trusted unit_price
- unit = round(solid_full × material_multiplier × color_multiplier) once
- No raw prices[] fallback
- No silent LDSP default when tiers exist without material_execution_code
- No prod DB / seed in this loop

## Latest run summary
[paste unit exit, e2e exit, failed check names, SHA]

## Ask
1) Any P0/P1/P2 missed by tests/E2E (false negatives)?
2) Any over-flagging that blocks good work?
3) Is the skill/runner/E2E layout safe and minimal?
4) Remaining must-do list (empty array if exhausted)
5) Codex reviewer status: approve | approve-with-notes | request-changes
6) Codex commit gate: safe_to_commit | needs_fixes | unsafe_scope

Do not edit files. Concise findings + must-do + gates only.
```
