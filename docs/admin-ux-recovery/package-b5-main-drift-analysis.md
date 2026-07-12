# Package B.5 — main drift analysis

**Date:** 2026-07-12 (MSK)
**Feature branch:** `feat/admin-ux-recovery` @ `bd8c73a`
**Base Package A:** `8709dac`
**origin/main:** `4d12dda`
**Ahead/behind at analysis:** ahead 2 / behind 7

## Diff summary

| Direction | Nature |
|-----------|--------|
| `origin/main..feat/admin-ux-recovery` | Package A docs/foundation + Package B Product Workspace (+ module timestamp compile fixes) |
| `feat/admin-ux-recovery..origin/main` | Storefront design polish (PR #16) + small backend lib helpers + gitignore/tsconfig |

## Incoming commits (`HEAD..origin/main`)

| SHA | Subject | `apps/backend` | `package.json` | `yarn.lock` | `@medusajs/*` | migrations | product module / `product_type` | Admin extensions | TS/build | Conflict with A/B |
|-----|---------|----------------|----------------|-------------|----------------|------------|----------------------------------|------------------|----------|-------------------|
| `35ff1e5` | feat(storefront): preserve approved catalog design polish | yes — 6 `src/lib/*` helpers only | storefront only | storefront only | no | no | no | no | no | **none** (disjoint paths) |
| `e1c1155` | chore(gitignore): ignore local generated media artifacts | no | no | no | no | no | no | no | no | none |
| `649f72e` | fix(storefront): set ES2017 target for Map iteration typecheck | no | no | no | no | no | no | no | storefront `tsconfig` | none |
| `6dcca7b` | fix(storefront): add media rewrite config and exclude QA from typecheck | no | no | no | no | no | no | no | storefront next/tsconfig | none |
| `d348791` | fix(storefront): ignore pre-existing QA board type errors in build | no | no | no | no | no | no | no | storefront next/tsconfig | none |
| `86c32a0` | feat(storefront): sync accepted mobile-nav and checkout polish | no | no | no | no | no | no | no | no | none |
| `4d12dda` | Merge PR #16 storefront design polish | merge | no | no | no | no | no | no | no | none |

## Conclusions

1. The 7 commits are **not** a Medusa upgrade. Lockfile on `origin/main` remains **2.13.3**.
2. Backend touches in `35ff1e5` are gallery/finish helper libs — **do not overlap** Package A/B admin paths.
3. Cherry-pick of `8709dac` + `bd8c73a` onto `origin/main` is expected to be **clean** for admin files.
4. PR #15 (`qa/willie-winkie-flow-a-matrix-board`) and merged PR #16 content are not rewritten by Package B.5; integration only **consumes** current `origin/main`.
