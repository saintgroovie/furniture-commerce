# Legacy media assignment board (dev / QA)

## Purpose

**Visual media assignment system** for manually aligning **legacy / front-manifest / repo-local** images with **seed-derived** products (`data/normalized/seed-products.json`).  
This is **not** a production rollout surface: **no Medusa apply**, no catalog-scope changes, no seed or evidence JSON mutation from the UI. Backend remains the source of truth.

## Open the page

Local storefront (see `apps/storefront/package.json` for port, usually **8000**):

- `http://localhost:8000/qa/legacy-media-assignment-board`

Start Next.js from **`furniture-commerce/apps/storefront`** (or a cwd where `docs/project/CODEMAP.md` and `data/normalized/` resolve) so read-only API routes can find repo JSON.

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

Large JSON is loaded via **read-only GET** routes under `/qa/legacy-media-assignment-board/api/*` (no write API).

## How to use the UI

1. **Collections (left)** — Pick **All collections**, a named collection, or **Unknown / unmatched hints** to filter the board. Active collection is highlighted.
2. **Filters (compact row)** — Search by SKU, handle, filename, or product title; narrow by confidence, source type, assignment state, previewable-only, and product focus (no current media / has candidates / has manual assignments). **Reset filters** clears them.
3. **Product cards (center)** — Each card shows current seed thumbnails, counts, and a **status badge** (e.g. no current media, has candidates, manually assigned, needs review). Click a card to **select** it (blue outline); selection enables quick actions in the pool.
4. **Zones per product** — **Primary** (one slot), **Gallery** (ordered; drag one tile onto another in the same lane to swap order), **Reference only**, **Rejected for this product**. Drag from the **media pool** into a zone, or drag onto the “return to unassigned” strip on the card to clear assignments. No broken `<img>` for unpreviewable refs.
5. **Media pool (right)** — Tabs: **Unassigned**, **Ambiguous**, **Confirmed**, **Unpreviewable** (text rows only), **Rejected** (global). Grid cards show preview, hints, and badges. Buttons: **→ Primary / Gallery / Reference** (require selected product), **Reject for product** (lane reject), **Reject (global)**. Only the first **120** items per tab are shown, with a message to narrow filters.
6. **Export** — **Copy JSON** / **Download JSON** saves `legacy-media-assignment-decisions.json` shape (see below). **Clear local decisions** wipes `localStorage`.

## Persistence

- **localStorage** key: `furniture-legacy-media-assignment-decisions-v1` (same key as before; payload may be **v2** zones + global rejections).
- Older **v1** `{ version: 1, assignments, rejections }` blobs are **migrated on load** into v2 zones (roles map to Primary / Gallery / Reference / lane reject; global rejections preserved).

## Export JSON shape (v2)

Copy/Download produces JSON including:

- `version`: **2**
- `exported_at`: ISO timestamp
- `review_meta`: scope, governance flags
- `products[]`: per product `handle`, `sku`, `collection`, `primary_candidate`, `gallery_candidates`, `reference_only`, `rejected` (lane-level rejects)
- `global_rejections[]`: not-this-product / global rejects
- `legacy_assignments_v1_flat`: flattened rows for scripts that still expect v1-style `assignments` (optional compatibility)

This is **handoff only** — not auto-applied to Medusa.

## Image preview (allowlisted)

Dev-only proxy: `/qa/legacy-media-assignment-board/preview?rel=…`  
Allowlisted repo-relative roots (no path traversal):

- `apps/backend/static/products/`
- `data/raw/downloaded-assets/`
- `data/processed/storefront-assets/`
- `data/raw/front/` (images; `.json` blocked)
- `data/raw/pdf-assets/`
- `data/raw/assets/`

HTTP(S) previews only when already present on inventory rows. `/WOODRIGHT` / Yandex paths without a local file appear under **Unpreviewable** as text, not as `<img>`.

## Confidence semantics (matcher)

See `docs/storefront/legacy-media-product-candidate-map.md`.

## Next safe step (out of scope here)

After exporting reviewed decisions JSON, use a **separate gated executor** (dry-run first, explicit env confirm) if you need to consume approved rows — **not** part of this board.
