# Package D — validation

**Date:** 2026-07-12 (MSK)
**DB:** `medusa-admin-ux-b5`
**Node:** 22.22.2 (`Node 20 validation pending before merge`)

## Automated

| Check | Result |
|-------|--------|
| Unit A/B/C/D | **42/42 pass** |
| API images full replacement / reorder / thumbnail / upload+attach | proven on `:9001` |
| Browser QA 1440/1280/1024 | **pass** |
| Large gallery 96 | **pass** |
| Package C variants tab smoke | **pass** |
| page/console/5xx | **0** |

```sh
node --experimental-strip-types --test \
  src/admin/lib/errors/normalize-admin-error.test.ts \
  src/admin/lib/feature-flags/woodright-admin-flags.test.ts \
  src/admin/lib/product-workspace/product-workspace.test.ts \
  src/admin/lib/product-workspace/variant-matrix.test.ts \
  src/admin/lib/product-workspace/gallery-model.test.ts

B6_BASE=http://localhost:9001 NODE_PATH=/tmp/b5-playwright-qa/node_modules \
  node src/admin/__tests__/package-d-browser-qa.mjs
```

Evidence: `tmp/admin-ux-package-d/package-d-browser-qa.json`, `gallery-*.png`

## Codex

Plan: blocked → fixed stale/last-image/case
Impl: blocked → fixed snapshot/unlink/attach/thumbnail validation
Final: see review artifact after thumbnail fix

## Limits

- Physical storage delete not implemented (unlink only)
- No variant-media editor
- Drag-and-drop not shipped (keyboard ↑↓ / start / end)
- Upload absolute URL host may disagree with PORT — normalize to `/static`
