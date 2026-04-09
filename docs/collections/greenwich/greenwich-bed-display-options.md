# Greenwich Bed Display Options

Comparison of approaches to fix the duplicate-card problem for size-based products.

---

## Option A: Status Quo — One Card per Size SKU

Keep 5 separate products, 5 separate catalog cards.

| Aspect | Assessment |
|--------|------------|
| **Pros** | No code changes. Matches workbook 1:1. Backend model unchanged. |
| **Cons** | 5 visually identical cards. Misleading. Bad UX. |
| **Architecture impact** | None |
| **UX impact** | Poor — looks like broken duplicates |
| **Frontend logic** | None |
| **Scalability** | Problem worsens with every collection that has size variants |
| **Verdict** | **Not acceptable** for production |

---

## Option B: Consolidate into Single Medusa Product with Size Variants

Re-seed beds as 1 Medusa product with 5 variants (one per size). Each variant has its own SKU and price. Size selection happens on PDP via option picker.

| Aspect | Assessment |
|--------|------------|
| **Pros** | Correct Medusa pattern. One card. Built-in variant selector. Clean SEO. |
| **Cons** | Requires re-seed. Breaks workbook-row ↔ product 1:1 mapping. PDP needs variant picker. Cart logic changes (variant_id, not product_id). |
| **Architecture impact** | Medium — changes product-variant relationship; needs PDP variant selector component. |
| **UX impact** | Best — standard e-commerce "pick your size" flow |
| **Frontend logic** | PDP needs variant/size selector (standard Medusa pattern, not custom hack) |
| **Scalability** | Excellent — any product with size/color variants uses same pattern |
| **Verdict** | **Best long-term solution**, but requires coordinated seed + PDP work |

---

## Option C: Frontend-Only Card Grouping

Keep 5 backend products unchanged. In the catalog page, detect products with the same thumbnail or same `display_group` metadata, and render only one card per group. Link to the cheapest product or a landing page.

| Aspect | Assessment |
|--------|------------|
| **Pros** | No backend changes. Quick fix. |
| **Cons** | Grouping logic in frontend = business logic in thin client. Fragile (depends on thumbnail URL matching or metadata convention). PDP still shows single-size product, no variant picker. |
| **Architecture impact** | Low technically, but violates "storefront has no business logic" principle |
| **UX impact** | Fixes catalog, but PDP is still single-size. No way to switch sizes. |
| **Frontend logic** | Grouping heuristic — risky if done by thumbnail match, acceptable if by explicit metadata |
| **Scalability** | Moderate — works but requires metadata discipline |
| **Verdict** | **Acceptable as interim** if grouping is metadata-driven, not heuristic |

---

## Option D: Backend-Driven Display Group Metadata

Add `metadata.display_group` to size-variant products. Backend API returns this metadata. Storefront groups products by `display_group` in catalog, shows one card per group with "от X ₽" pricing. PDP remains single-product but shows links to other sizes.

| Aspect | Assessment |
|--------|------------|
| **Pros** | Backend drives grouping decision. Storefront logic is minimal (just "if group exists, collapse"). No re-seed. No schema change. |
| **Cons** | PDP still shows single-size product per page. No inline variant picker. Requires metadata maintenance. |
| **Architecture impact** | Low — extends existing metadata field; storefront reads metadata (not business logic). |
| **UX impact** | Good — catalog is clean. PDP can link to other sizes. |
| **Frontend logic** | Minimal — group-by on existing metadata field. Not a hack. Reusable for any grouped product. |
| **Scalability** | Good — any future collection sets `display_group` in its ingestion data |
| **Verdict** | **Best balance for now**: safe, reusable, backend-driven, minimal risk |

---

## Comparison Matrix

| Criterion | A (status quo) | B (variants) | C (FE grouping) | D (metadata group) |
|-----------|:---:|:---:|:---:|:---:|
| Fixes duplicate cards | No | Yes | Yes | Yes |
| Backend change needed | No | Yes (re-seed) | No | Yes (metadata only) |
| Frontend change needed | No | Yes (variant picker) | Yes (grouping logic) | Yes (minimal grouping) |
| Architecture compliance | OK | Best | Risky | Good |
| UX quality | Bad | Best | OK | Good |
| Effort | None | High | Low | Low-Medium |
| Reusable for other collections | N/A | Yes | Moderate | Yes |
| PDP size switching | No | Yes (inline) | No | Partial (links) |
| Risk | N/A | Medium | Low | Low |
