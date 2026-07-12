# Package B.6 validation

**Date:** 2026-07-12 (MSK)  
**Worktree:** `/Users/leonidmbp/Documents/projects/furniture-commerce-admin-ux-integration`  
**Branch:** `feat/admin-ux-recovery-integration-20260712`  
**Isolated DB:** `medusa-admin-ux-b5` (no shared DB writes)

## Root cause (proven)

Browser `pageerror` before fix:

```text
Could not resolve "@medusajs/admin-sdk" imported by "@medusajs/draft-order". Is it installed?
```

Stock Admin entry always loads `@medusajs/draft-order/admin`. Missing package → Vite dep graph throws → React never mounts → white screen. Package B shim did **not** satisfy the package import.

Secondary (HMR on): React Refresh double-inject on Woodright widget/route (`inWebWorker` already declared) → module transform returns HTML error page → MIME mismatch. Default `hmr: false` + existing disable plugin avoids this. Use full reload for QA.

Tertiary (production HTTP): Medusa sets `Secure` cookies when `NODE_ENV=production`. Local HTTP cannot store them. Opt-out via `COOKIE_SECURE=0` → `cookieOptions.secure=false`.

## Fixes applied

| Change | Purpose |
|--------|---------|
| `@medusajs/admin-sdk@2.13.3` exact | Satisfy draft-order + official defineRoute/WidgetConfig |
| Remove `medusa-admin-sdk.ts` shim | Official imports only |
| Pin `@medusajs/cli@2.13.3` + `ts-node`/`tsconfig-paths` | Keep CLI aligned; avoid accidental 2.17.2 pull |
| Keep HMR-disable plugin (default off) | Prevent Refresh double-inject |
| `COOKIE_SECURE=0` → cookieOptions | Local `medusa start` session on HTTP |

## Validation matrix

| Check | Result |
|-------|--------|
| Unit tests 25/25 | pass |
| `git diff --check` (scoped) | pass |
| develop `/app/login` DOM | Welcome to Medusa + inputs |
| develop login → dashboard | Orders/Products |
| develop product list/detail | pass |
| develop flag off workspace | «Функция выключена» |
| develop flag on workspace | title/prices/media/save |
| develop unsaved guard | confirm dialog + stay |
| develop save + refresh | «Изменения сохранены» |
| develop back/forward | pass |
| develop 404 workspace | «Запись удалена» |
| viewports 1440/1280/1024 | no horizontal overflow |
| pageerrors (interactive QA) | none unexpected |
| `medusa build` frontend | success (backend TS warns pre-existing) |
| `medusa start` from `dist/` + `COOKIE_SECURE=0` | login + dashboard + flag-on workspace |
| Shared DB | unused |

## Commands (operator)

```sh
# develop
cd apps/backend
export PORT=9001 TS_NODE_TRANSPILE_ONLY=1 WOODRIGHT_STOREFRONT_ORIGIN=http://localhost:3002
# do not set ADMIN_VITE_HMR=1 unless debugging HMR
./node_modules/.bin/medusa develop --no-types

# production
yarn medusa build
cd dist
COOKIE_SECURE=0 NODE_ENV=production PORT=9001 ../node_modules/.bin/medusa start --no-types

# DOM smoke (Playwright must be resolvable)
B6_BASE=http://localhost:9001 node src/admin/__tests__/product-workspace-render.smoke.mjs
```

## Feature flag

Browser reads `localStorage.WOODRIGHT_ADMIN_UX_V1` / `window.__WOODRIGHT_ADMIN_UX_V1__` / `import.meta.env`. Server process env alone is **not** enough for Admin UI.
