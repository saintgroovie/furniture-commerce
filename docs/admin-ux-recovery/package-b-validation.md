# Package B validation report

**Date:** 2026-07-12 (MSK)
**Branch:** `feat/admin-ux-recovery`
**Base:** `8709dac` (Package A)

## Upgrade status

`Medusa 2.17.2 upgrade deferred; package versions unchanged`

## Commands

```sh
git diff --check
node --experimental-strip-types --test \
  src/admin/lib/errors/normalize-admin-error.test.ts \
  src/admin/lib/feature-flags/woodright-admin-flags.test.ts \
  src/admin/lib/product-workspace/product-workspace.test.ts
```

## Results

| Check | Result |
|-------|--------|
| Unit tests | **25/25 pass** |
| Live API view-model smoke (:9000) | OK — Комод: 96 images, price 109 500 ₽, type missing in Admin `*productType` response |
| `medusa develop` :9001 | **blocked** — `Cannot add alias "product_type" for "product"` (2.13.3 worktree vs shared DB / link graph used by 2.17 runtime) |
| Interactive browser QA 1440/1280/1024 | **not completed** (blocked by develop boot) |
| package.json / yarn.lock | unchanged |
| Codex plan | `safe_to_continue` |
| Codex impl | `blocked` → imports fixed → `safe_to_continue` (QA gap remains) |

## Residual

- Full interactive Admin UI QA requires either isolated DB for 2.13 or deferred Medusa upgrade package.
- Classification may show «Тип не указан» when Admin API does not expand `productType` on the shared runtime dataset — SoT still correctly reads linked field when present.
