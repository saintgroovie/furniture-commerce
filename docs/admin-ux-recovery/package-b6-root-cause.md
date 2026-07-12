# Package B.6 — root cause

**Date:** 2026-07-12 (MSK)  
**Integration HEAD:** `ba4791d`

## Concrete browser error (before fixes)

From Playwright `pageerror` while loading `http://127.0.0.1:9001/app`:

```text
Could not resolve "@medusajs/admin-sdk" imported by "@medusajs/draft-order". Is it installed?
```

**Stack (source):**

`/app/@fs/.../node_modules/.vite/deps/@medusajs_draft-order_admin.js` (line ~148)

**Machine artifact:** `tmp/admin-ux-recovery-b6/browser-runtime-errors.json`

## Why the whole Admin is blank

1. Generated `entry.jsx` always loads plugin `@medusajs/draft-order/admin`.
2. That plugin imports `@medusajs/admin-sdk` at module evaluation time.
3. Vite cannot resolve the package (not installed / not in lockfile as resolvable dependency).
4. The thrown `pageerror` aborts React bootstrap → empty `#medusa` root → white screen.
5. HTTP `/app` and `/app/entry.jsx` still return 200 with JS content-type — HTML shell is fine; **runtime module graph is broken**.

## What is NOT the first-bad root cause

| Suspect | Verdict |
|---------|---------|
| Product Workspace route/widget | **Not first** — entry.jsx has **0** woodright imports; crash is in draft-order plugin before custom extensions matter |
| Local `medusa-admin-sdk.ts` shim | **Not root of stock blank** — draft-order does not use the shim; it imports the package name directly |
| HMR-disable plugin | Secondary (WebSocket `24678` / 426 noise); blank screen reproduces with the admin-sdk resolution `pageerror` |

## Case 0 implication

`origin/main` also lacks direct `@medusajs/admin-sdk`. The same draft-order import failure is expected on a clean main Admin Vite load unless the package is present transitively and hoist-visible (it is **missing** in this install). Package B is not the primary blank-screen introducer; it only added a shim that does not satisfy draft-order.

## Fix decision

Add **exact** `@medusajs/admin-sdk@2.13.3` (match Medusa 2.13.3). Replace Package B shim imports with official SDK. Remove shim if unused. Re-test Admin render. Re-evaluate HMR plugin only after Admin renders.

## Post-fix confirmation (2026-07-12)

After adding `@medusajs/admin-sdk@2.13.3` and removing the shim:

- Stock `/app/login` renders DOM («Welcome to Medusa»).
- Login → dashboard/products/product detail work in develop.
- Product Workspace flag off/on, save, unsaved guard, 404, viewports 1440/1280/1024 verified.
- HMR kept disabled by default (Refresh double-inject still breaks Woodright modules when `ADMIN_VITE_HMR=1`).
- Production `medusa start` from `dist/` requires `COOKIE_SECURE=0` on local HTTP so session cookies are not `Secure`.
