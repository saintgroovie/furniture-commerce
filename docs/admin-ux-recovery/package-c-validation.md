# Package C — validation

**Date:** 2026-07-12 (MSK)
**Branch:** `feat/admin-ux-recovery-integration-20260712`
**DB:** `medusa-admin-ux-b5` only (shared `:9000` not used for writes)
**Node:** 22.22.2 (`Node 20 validation pending before merge`)

## Automated

| Check | Result |
|-------|--------|
| `git diff --check` | pass (no whitespace errors on Package C paths) |
| Package A/B/C unit tests (34) | **pass** |
| API SKU update + authoritative list reload + restore | HTTP 200; prices untouched |
| API simple price update (full replacement) + restore | HTTP 200; 12500→12600→12500 |
| Proven `prices` replacement semantics | documented in `package-c-data-contract.md` |

```sh
cd apps/backend
node --experimental-strip-types --test \
  src/admin/lib/errors/normalize-admin-error.test.ts \
  src/admin/lib/feature-flags/woodright-admin-flags.test.ts \
  src/admin/lib/product-workspace/product-workspace.test.ts \
  src/admin/lib/product-workspace/variant-matrix.test.ts
```

## Browser QA (production start)

Contract: `COOKIE_SECURE=0` + `medusa start` from `apps/backend/dist/` on `PORT=9001`.
Playwright host must be `http://localhost:9001` (not `127.0.0.1`) so session cookies match.

```sh
NODE_PATH=/tmp/b5-playwright-qa/node_modules \
B6_BASE=http://localhost:9001 \
node src/admin/__tests__/package-c-browser-qa.mjs
```

| Check | Result |
|-------|--------|
| Variants tab 1440/1280/1024 | **pass** — compact «Основной вариант», SKU/price actions, fallback |
| BESPOKE warning | **pass** |
| Missing classification | **pass** — «Тип товара не указан» |
| No-price fixture | **pass** — attention / missing price hint |
| Flag off | **pass** — workspace disabled |
| `pageerror` / `console.error` / 5xx | **0** |
| Request loops | none observed |

Evidence: `tmp/admin-ux-package-c-qa/package-c-browser-qa.json`, `variants-*.png`

## Package B regression

| Check | Result |
|-------|--------|
| Login + dashboard | pass |
| Product list | pass |
| Product details | pass |
| Workspace Overview | pass |
| page/console/5xx | 0 |

Evidence: `tmp/admin-ux-package-c-qa/package-b-regression.json`

## Build / runtime

| Check | Result |
|-------|--------|
| `medusa develop` `:9001` | boots (Admin URL ready); SPA session flaky for headless on develop — production start used for QA |
| `medusa build` | frontend **success**; backend seed TS warnings/errors pre-existing (not Package C) |
| `medusa start` from `dist/` + `COOKIE_SECURE=0` | **pass** |

## Codex

| Gate | Verdict |
|------|---------|
| After fail-closed hydration + bulk rebuild | **`safe_to_commit`** |

Artifact: `tmp/admin-ux-recovery-codex/package-c-variants-prices-review.txt`

## Known limits

- B5 fixtures are mostly single Default variants; multi-option matrix covered by unit tests.
- Price-list linkage not visible on AdminPrice; complex gate = rules / min-max / duplicate currency.
- Variant create/delete and price delete not in Package C UI.
- Hydration capped at 100 variants (truncated disclosed).
- Node 20 validation pending before merge.
