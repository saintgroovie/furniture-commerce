# Package B.5 validation

**Date:** 2026-07-12 (MSK)
**Integration branch:** `feat/admin-ux-recovery-integration-20260712`
**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration`
**Base:** `origin/main` @ `4d12dda`

## Upgrade status

`Medusa 2.17.2 upgrade deferred; package versions unchanged` (lockfile remains 2.13.3)

## Strategy

Variant B selected for matrix (main=2.13.3). Shared `:9000` / `medusa-store` blocked (runtime 2.17.2). Isolated DB `medusa-admin-ux-b5` used for migrate/seed/API QA.

## Boot unblocker

`model.define("product_type")` + link alias conflict on clean 2.13.3. Renamed to `product_classification` / `productClassification` (same pattern as dirty 2.17 tree). Module migrations generated for isolated DB only. Shared DB not migrated.

## Commands / results

| Check | Result |
|-------|--------|
| Unit tests 25/25 | pass |
| `medusa db:migrate` on `medusa-admin-ux-b5` | pass after rename + generated migrations |
| Fixture seed `seed-package-b5-fixture.ts` | pass (8 products incl. 96-image gallery) |
| Graph `product_classification.product_type` | STANDARD/CONFIGURABLE/BESPOKE/missing verified |
| Admin API `*product_classification` | HTTP 200 for all fixtures; 404 for missing id |
| Save title POST | 200 (edit + revert) |
| `/app` + workspace route shell | HTTP 200 |
| Interactive Admin UI (Playwright) | **fail** — blank white screen; Vite module/HMR issues (`ws://127.0.0.1:24678`, earlier react-refresh double inject) |
| Flag-on/off entry widget in browser | **not confirmed** (UI blank) |
| package.json / yarn.lock | unchanged |
| Shared DB | no migrations / no schema writes |

## Interactive QA evidence

Artifacts under `tmp/admin-ux-recovery-codex/` (local, not for commit):

- `browser-qa-results.json`
- `qa-screens/*.png` (blank shells)
- `api-smoke2.txt`, `graph-verify.log`

## Residual blockers for Package B `done`

1. Medusa Admin Vite UI does not render content in headless Chromium on this 2.13.3 integration stack (blank page).
2. `@medusajs/admin-sdk` is not present in main lockfile; Package B uses a local shim — may need a **same-family** `admin-sdk@2.13.3` add as a separate compatibility decision (not 2.17.2).
3. Backend develop requires `TS_NODE_TRANSPILE_ONLY=1` due to pre-existing `unknown` service typing in admin API routes on main.
