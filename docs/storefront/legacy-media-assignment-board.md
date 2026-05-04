# Legacy media assignment board (dev / QA)

## Purpose

Interactive **triage only** for aligning **legacy / front-manifest / repo-local** images with **seed-derived** product handles (`data/normalized/seed-products.json`).  
This is **not** a production rollout surface: **no Medusa apply**, no catalog-scope changes, no seed or evidence JSON mutation from the UI.

## Open the page

Local storefront (default port from `package.json`):

- `http://localhost:8000/qa/legacy-media-assignment-board`

In **production** (`NODE_ENV=production`) the board and its JSON/bootstrap routes return **404** unless `LEGACY_MEDIA_QA_BOARD_ALLOW_PROD=1` is set (discouraged).

## Prerequisites

From repo root, regenerate artifacts when sources change:

```bash
node scripts/build-legacy-media-inventory.mjs
node scripts/build-legacy-media-product-candidate-map.mjs
```

Outputs:

- `data/normalized/legacy-media-inventory.json`
- `data/normalized/legacy-media-product-candidate-map.json`
- `data/normalized/legacy-media-assignment-decisions.template.json`

The page loads large JSON via **read-only GET** routes under `/qa/legacy-media-assignment-board/api/*` (no write API).

## Behaviour

- **Summary** and **filters** (collection, confidence, previewable, source type, assigned state, text search).
- **Product lanes:** handle, SKU, collection, current seed thumbnails, heuristic **candidates** (read-only chips), **manually assigned** slots with role selector.
- **Unassigned pool:** drag from here onto a lane; drop back onto the pool to unassign.
- **Ambiguous** (identity) strip for quick access.
- **Unpreviewable references:** text rows only (no broken `<img>` for `/WOODRIGHT` or missing files).

### Roles (export)

Per assigned image: `primary_candidate` | `gallery_candidate` | `reference_only` | `do_not_use`.  
**Reject** sends an item to `rejections` with reason `not_this_product`.

### Persistence

- Decisions: **browser `localStorage`** only (key `furniture-legacy-media-assignment-decisions-v1`).
- **Copy JSON** / **Download JSON** produce a document compatible with saving as  
  `data/normalized/legacy-media-assignment-decisions.json` (operator handoff; **not** auto-ingested by this task).

### Image preview (allowlisted)

Dev-only proxy: `/qa/legacy-media-assignment-board/preview?rel=…`  
Allowlisted repo-relative roots (no path traversal):

- `apps/backend/static/products/`
- `data/raw/downloaded-assets/`
- `data/processed/storefront-assets/`
- `data/raw/front/` (images; `.json` blocked)
- `data/raw/pdf-assets/`
- `data/raw/assets/`

Backend static is also shown via `NEXT_PUBLIC_MEDUSA_BACKEND_URL` `/static/...` when the inventory row resolves to `apps/backend/static/...`.

## Confidence semantics (matcher)

See `docs/storefront/legacy-media-product-candidate-map.md`. Short version:

| Value | Meaning |
|-------|---------|
| **confirmed** | Strong deterministic signal (SKU hint, SKU in path/filename, or basename matches an existing seed product image). |
| **probable** | Single strong heuristic candidate, lower certainty than confirmed. |
| **ambiguous** | Multiple products score similarly. |
| **unmatched** | No candidate above threshold. |
| **unpreviewable** | Reference exists but **no local preview** in this environment; `identity_confidence` in JSON still records the heuristic identity tier. |

Legacy media remains a **hint** layer; ambiguous or unmatched items belong in backlog / manual review, not silent auto-card promotion.

## Next safe step (out of scope here)

After exporting reviewed `legacy-media-assignment-decisions.json`, a **separate gated executor** (dry-run first, explicit env confirm) may consume approved rows — **not** implemented in this QA board task.
