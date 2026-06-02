# Polished storefront — accepted baseline

**Status:** accepted on `main` (2026-05-29).

## Git baseline

| Item | Value |
|------|--------|
| Branch | `main` |
| Commit | `30c2ce6` — Restore polished storefront UI from foundation baseline (#12) |
| Prior cart fix | `0070eef` — fix(cart): bypass broken promotion refresh on cart create (#11) |

Foundation reference (historical): `storefront/phase1-foundation-and-polish` @ `5992920`.

## What shipped

### PR #11 — cart / backend workaround (`0070eef`)

- `apps/backend/scripts/patch-skip-cart-promotions.mjs` — idempotent postinstall patch
- `apps/backend/package.json` — `postinstall` runs patch script
- `apps/storefront/src/lib/api/cart.ts` — sends first Store API `region_id` on cart create

**Why:** Medusa promotion workflow SQL error on `POST /store/carts` (upstream #14149). Patch skips automatic promotion refresh on cart create/refresh until Medusa upgrade or upstream fix.

**Safety note:** Promotion auto-apply on cart create/refresh is disabled locally until upgrade.

### PR #12 — polished storefront UI + legacy cart grouping (`30c2ce6`)

- Two-row **WOODRIGHT** header, dropdown nav, home hero
- Polished catalog card grid with thumbnails
- Polished PDP with media switchers
- Legacy cart UX: **Woodright** / **Woodright Kids** sections, line meta (`N шт. · … ₽`), remove, **Итого**, dark **Оформить заказ**
- Minimal stub routes for header links (`/kids`, `/about`, `/designers`, `/contacts`, `/bespoke/*`)
- Supporting libs: `catalog-scope`, `kids`, `product-images`, `display-group`, etc.

**Out of scope for PR #12:** QA boards, backend, DB/seed, media apply.

## Dev requirements (local `:3002`)

- `apps/storefront/.env.local`: `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` set (do not commit)
- Backend `STORE_CORS` must include `http://localhost:3002` when using `yarn dev --port 3002`
- `FURNITURE_REPO_ROOT` points at repo root for data/docs loaders
- After env or CORS changes: restart backend container and storefront dev server
- Backend patch: runs on `yarn install` / container start (`node scripts/patch-skip-cart-promotions.mjs`)

Example storefront dev:

```bash
cd apps/storefront
rm -rf .next
FURNITURE_REPO_ROOT=/path/to/furniture-commerce yarn dev --port 3002
```

## Proof (local, not committed)

- Post-merge smoke: `tmp/post-merge-pr12-smoke/` (`summary.json`, screenshots)
- Prior PR2 / Kids grouping: `tmp/polished-storefront-pr2-proof/`, `tmp/old-cart-kids-grouping-proof/`
- Cart workaround API: `tmp/cart-workaround-pr1-proof/`

## Rejected / superseded

- **Phase 2 home** (PR #9) — reverted on `main` via PR #10 (`2f15eda`); not the polished baseline
- Feature branches `restore/old-polished-storefront-ui*`, `fix/cart-create-promotion-workaround` — content merged via squash PRs #11–#12; safe to archive/delete remote branches after operator confirmation

## Related docs

- `docs/storefront-phase1.md` — thin-client / mutation contract
- `docs/PROJECT_STATUS.md` — project-wide status
- `docs/architecture-guardrails.md` — do not break QA boards / ingestion without explicit task
