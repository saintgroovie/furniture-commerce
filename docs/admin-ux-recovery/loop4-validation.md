# Loop 4 validation record — Woodright Admin UX

Date: 2026-07-13 MSK  
Branch: `feat/admin-ux-recovery-integration-20260712`  
Plan: Strategy A (stock-shell + contextual Woodright)

## Journeys (DoD)

1. **One-admin** — dashboard queue; single sidebar entry «Рабочий стол Woodright»; no dual-admin choice; flag-off redirects without stub.
2. **Readiness** — «Готовность карточки» must/should + CTAs; Save saves only title/description/status.
3. **Simple promo** — wizard %/fixed, no campaign step, create draft only; verify via product/variant search; no `variant_…` / `pk_…` fields; key from `WOODRIGHT_STORE_PUBLISHABLE_KEY`; temp activate + restore.
4. **RU desktop** — 1440×900 screenshots from consolidated smoke; Russian actionable copy.

## Smoke

| Smoke | Role |
|-------|------|
| `woodright-loop4-operator-journeys.smoke.mjs` | Consolidated Loop 4 journeys + screenshots |
| `woodright-flag-off-redirects.smoke.mjs` | Flag-off redirects + sidebar |
| `product-workspace-render.smoke.mjs` | Workspace + readiness chrome |
| Unit: `readiness.test.ts`, `dashboard-model.test.ts`, `payload.test.ts`, `stock-admin.test.ts` | Logic gates |

## Runtime status

**Foreground run 2026-07-13 MSK:** Loop 4 consolidated smoke **PASS** on `http://localhost:9001`  
(`one_admin`, `readiness`, `simple_promo_ui`, `resilience`; pageErrors empty).  
Also: `woodright-flag-off-redirects.smoke.mjs` **PASS**.

Isolated Admin:

```sh
./scripts/start-woodright-admin-ux-b5.sh start
./scripts/start-woodright-admin-ux-b5.sh status
```

Then:

```sh
cd apps/backend
NODE_PATH=/tmp/b5-playwright-qa/node_modules node src/admin/__tests__/woodright-loop4-operator-journeys.smoke.mjs
```

Screenshots/report: under `tmp/admin-ux-loop4/` (local, not committed).

## Operator access

- URL: http://localhost:9001/app/woodright  
- Login: `admin@woodright.ru` / `admin123`  
- Use `localhost`, not `127.0.0.1`  
- PR: https://github.com/saintgroovie/furniture-commerce/pull/23 (ready for review)

## Parity

Operator guide (`docs/admin-ux-recovery/operator-guide.md`) describes the same four journeys and the stock-shell boundary. Classification SoT is `product_classification` (see `classification-p0-revised.md`); cart middleware fails closed when classification is missing.
