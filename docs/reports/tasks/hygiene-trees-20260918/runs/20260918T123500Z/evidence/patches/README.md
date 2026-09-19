# Parked patches - do not apply as-is

Captured 2026-09-18 vs `origin/main`. Re-analyzed 2026-09-18: **still do not apply**.

Full consumer write-up:
`docs/reports/tasks/hygiene-trees-20260918/runs/20260918T124800Z/leftover-regression-analysis.md`

| File | Why parked |
|---|---|
| `C2-route-veil-vs-origin-main.patch` | Drops boot failsafe; failed images can hold the veil 8s |
| `C3-product-card-PARKED-vs-origin-main.patch` | Skips closed-front hero + buyer-facing title |
| `C4-catalog-browse-slim-vs-origin-main.patch` | Drops `material_execution_code` used by promotion «от » |

Fidelity tests now fail if those land as-is.
