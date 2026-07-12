# Package F — validation

**Date:** 2026-07-12 (MSK)  
**Worktree:** integration `feat/admin-ux-recovery-integration-20260712`  
**DB:** `medusa-admin-ux-b5`  
**Admin:** `:9001`

## Unit tests

### Node 22.22.2

```sh
cd apps/backend
node --experimental-strip-types --test 'src/admin/lib/**/*.test.ts'
# → 193/193 pass
```

### Node 20.20.2 (Homebrew `node@20`, keg-only)

`--experimental-strip-types` отсутствует на Node 20 → suite через `tsx`:

```sh
PATH="/usr/local/opt/node@20/bin:$PATH" npx tsx --test \
  src/admin/lib/woodright/*.test.ts \
  src/admin/lib/promotions/*.test.ts \
  src/admin/lib/errors/*.test.ts \
  src/admin/lib/feature-flags/*.test.ts \
  src/admin/lib/product-workspace/*.test.ts
# → 193/193 pass
```

Default `node` on PATH remains 22 (no global switch).

## Browser QA

Artifact: `tmp/admin-ux-package-f/package-f-browser-qa.json` (not committed).

| Viewport | Dashboard | Tab deep-link | Promotions filter | Flag off |
|----------|-----------|---------------|-------------------|----------|
| 1440 | OK | OK | OK | OK |
| 1280 | OK | OK | OK | OK |
| 1024 | OK | OK | OK | OK |
| 768 | OK (graceful) | OK | OK | OK |

pageErrors=0, consoleErrors=0, failed 5xx=0.

## Develop / start

- `medusa develop --no-types` on `:9001` after minimal typing casts for pre-existing custom API modules + middleware body cast
- Frontend Vite build previously green (Package E residual: backend seed TS warnings)

## Codex

Final gate: retry after quota reset (see artifact). Required before commits per package brief.
