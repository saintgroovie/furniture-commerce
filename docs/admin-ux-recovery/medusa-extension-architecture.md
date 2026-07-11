# Medusa extension architecture — Admin UX Recovery

**Package:** A  
**Branch:** `feat/admin-ux-recovery` (isolated worktree from `origin/main`)

---

## Principles

1. Medusa backend remains source of truth.  
2. Extend via Admin widgets, Admin UI routes, thin Admin API adapters, modules already present.  
3. Never fork `@medusajs/dashboard`, edit `node_modules` for Admin UX, or duplicate Product/Price/Promotion engines.  
4. Stock Admin remains fallback while feature flag is off or for power users.  
5. Prefer read/write through Admin REST + JS SDK + core workflows.

---

## Decision record (ADR-A1)

### Version alignment

**Options:**

- A. Stay on lockfile **2.13.3** and add `@medusajs/admin-sdk@2.13.3`  
- B. Upgrade backend Medusa family to **2.17.2** (matches recent local runtime) then add admin-sdk  

**Recommendation for Package B start:** **B**, as a dedicated commit after Codex review of lockfile blast radius — Admin Vite extensions and types align with runtime. Package A docs/foundation must compile without requiring the upgrade first (pure TS libs + docs).

### Porting from dirty runtime tree

Allowed later as **explicit scoped file copies** (not branch merge):

- `src/admin/vite/**` stability plugins  
- `src/admin/i18n/**`  
- `src/admin/lib/collection-display-labels.ts`  
- favicon assets  

**Forbidden:** merging PR #15 / #16 branches; bringing media-ops storefront diffs; `git add -A`.

### Media SoT

Buyer-facing: `product.thumbnail` + `product.images`.  
Do not build Admin gallery that writes a parallel gallery store.  
Metadata execution matrices may be **displayed** as operator hints; promoting them to Medusa options/variants requires a separate model ADR.

### Promotions

Wizard writes stock Promotion/Campaign entities only.  
UI must disclose storefront cart-promotion patch limitations until cart apply is restored.

---

## Layering

```
Admin UI (widgets/routes)
  → typed client helpers (admin/lib)
  → Admin HTTP API (stock + existing /admin/* Woodright)
  → Medusa modules / workflows
  → PostgreSQL
```

Optional thin `/admin/woodright/*` read-models only for aggregations (completeness, placement) — no second product table.

---

## Feature flag

Env: `WOODRIGHT_ADMIN_UX_V1=1`  

When off: only stock Admin (+ any pre-existing runtime widgets if ported).  
When on: Woodright nav entries and Product Workspace routes visible.

---

## Error contract

All Woodright Admin surfaces use `normalizeAdminError()` → operator message + optional technical details drawer.  
Never toast raw JSON as the primary message.

---

## Testing strategy

- Unit: error normalizer, completeness helpers, promotion summary (later)  
- Component: matrix/gallery/wizard (later packages)  
- Integration: Admin API with auth  
- E2E: flagged routes only  

---

## Out of scope for extension layer

- Rewriting Medusa Admin chrome entirely  
- Monkey-patching dashboard bundles  
- Direct SQL updates for prices/images/promotions  
- Destructive migrations without explicit approval
