# Package B.5 — version matrix

**Date:** 2026-07-12 (MSK)

## Feature branch (`feat/admin-ux-recovery` @ `bd8c73a`)

| Item | Value |
|------|-------|
| `@medusajs/medusa` | **2.13.3** (lockfile + installed) |
| `@medusajs/framework` | **2.13.3** |
| `@medusajs/ui` | **4.1.3** |
| `@medusajs/admin-sdk` | **not in package.json** (Package B local shim) |
| DB schema expectation | Medusa 2.13 + project custom modules/links including `product_type` extension |

## origin/main (`4d12dda`)

| Item | Value |
|------|-------|
| `@medusajs/medusa` | **2.13.3** (`^2.0.0` → lock 2.13.3) |
| `@medusajs/framework` | **2.13.3** |
| `@medusajs/ui` | present via Medusa admin stack (lock family 2.13) |
| `@medusajs/admin-sdk` | **not declared** on main |
| Migrations | no new Medusa upgrade migrations in the 7 incoming commits |
| Product module customizations | `product-extension` module + `defineLink(Product, productType)` unchanged by PR #16 |

## Shared runtime (read-only)

| Item | Value |
|------|-------|
| Process | PID listening `:9000` → `medusa start` |
| CWD | `/Users/leonidmbp/Documents/projects/furniture-commerce/apps/backend` (dirty `qa/willie-winkie-flow-a-matrix-board`) |
| Installed Medusa | **2.17.2** (`medusa`, `framework`, `cli`, `admin-sdk`) |
| Shared DB | Postgres `medusa-store` @ `localhost:5432` (Docker `medusa_postgres`) |
| Alias failure on 2.13 develop | `Cannot add alias "product_type" for "product". It is already defined for Service "productExtensionModuleService".` |
| Alias root cause (analysis) | Custom model `model.define("product_type", …)` + linkable `productType` conflicts when **DB/link graph / runtime** was advanced by **2.17.2** dirty tree while **code** is 2.13.3 — version/runtime skew, not a Package B UI bug |

## Decision

| Question | Answer |
|----------|--------|
| Variant A (main already 2.17)? | **No** |
| Variant B (main 2.13 + isolated QA DB)? | **Yes — selected** |
| Variant C (main vs shared runtime diverge)? | **Yes for shared-DB QA** → shared `:9000` / `medusa-store` **blocked** for 2.13 Product Workspace UI verification |

**Package B.5 policy:** integrate onto `origin/main` (2.13.3); run interactive QA only against a **new local database name**; never migrate or write shared `medusa-store` with Package B.5 tooling.

## Post-integration note (2026-07-12)

Even on fresh `medusa-admin-ux-b5`, Medusa 2.13.3 failed to boot until the Woodright entity was renamed from `product_type` → `product_classification` (joiner alias collision with `productExtensionModuleService`). This is a **code** blocker on main, not only a shared-runtime skew.
