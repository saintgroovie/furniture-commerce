# Legacy media assignment board (dev / QA)

## Purpose

**Visual media assignment** for aligning legacy / front-manifest / repo-local images with **seed-derived** products (`data/normalized/seed-products.json`).  
**Not** production rollout: **no Medusa apply**, no catalog-scope edits, no seed or evidence mutation from this UI. Export JSON is a **handoff artifact** only.

---

## Open the page

Local storefront (port from `apps/storefront/package.json`, often **8000**):

- `http://localhost:8000/qa/legacy-media-assignment-board`

Start Next from **`furniture-commerce/apps/storefront`** so read-only `api/*` routes resolve repo `data/normalized/*.json`.

### If APIs return 500 (`Repo root not resolved`)

The server must find the monorepo root by walking up from `process.cwd()` and from this module’s path until both exist: `docs/project/CODEMAP.md` and the directory `data/normalized/`.

- Run **`yarn dev` from `apps/storefront`** inside a **full** `furniture-commerce` checkout (not a partial copy without `docs/` or `data/`).
- Or set an explicit absolute path (e.g. Docker):

  `FURNITURE_REPO_ROOT=/absolute/path/to/furniture-commerce`

  (Alias: `FURNITURE_COMMERCE_ROOT` — same meaning.)

Then restart Next. The board shows a **Retry** button and prints the JSON **Server response details** when an API fails.

### Read-only API error JSON (dev diagnostics)

`/qa/legacy-media-assignment-board/api/{inventory,candidates,products}` return **200** with the same bodies as before on success. On failure they return **500** with a machine-readable `error` code (never arbitrary path traversal):

| `error` | Meaning |
|---------|---------|
| `repo_root_not_resolved` | `cwd`, `checked_paths` (seeds walked), `expected_markers`, `hint` |
| `missing_file` | `missing_file` (repo-relative path), `resolved_repo_root`, `absolute_path_checked`, `cwd` |
| `read_failed` | `missing_file`, `message` |
| `parse_error` | `parse_error`, `path` |
| `invalid_seed_shape` | **products** route only — `seed-products.json` is not a JSON array |

**Docker on port 8000:** if the container’s filesystem does not include both `docs/` and `data/normalized/` at the resolved repo root, you still get `repo_root_not_resolved` or `missing_file`. Prefer **host Next from `apps/storefront`** against a full checkout, or mount `./docs` and `./data` read-only into the container and set `FURNITURE_REPO_ROOT` — do not change compose without team confirmation.

In **production** (`NODE_ENV=production`) the board returns **404** unless `LEGACY_MEDIA_QA_BOARD_ALLOW_PROD=1` (discouraged).

---

## Workflow (at a glance)

The page follows a simple sequence:

1. **Choose collection** — Left sidebar: **All collections**, a specific collection, or **Unknown / unmatched** (matcher could not infer collection). Use the search box to filter long collection lists.
2. **Select product** — Click a product row or **Review product**. The row shows status (e.g. *Has auto matches*, *Needs review*, *Manually edited*), collection badge, thumbnail, and candidate counts.
3. **Review images** — Use the **Media pool** (right): previews, badges, and optional **Inspector** (open via **Details** on a tile or by clicking an unpreviewable list row).
4. **Assign roles** — Only in the **Selected product** panel (center): **Primary**, **Gallery**, **Reference only**, **Rejected for this product**. Drag from the pool into a zone, or use **Primary / Gallery / Ref / Reject** on a tile. Drag into the “return to unassigned” strip to clear a lane placement.
5. **Export JSON** — **Copy JSON** or **Download JSON**. Text explains this is **browser-local decisions only**; a short success hint appears after copy/download. **Clear local decisions** asks for confirmation first.

**Header** shows primary metrics (reviewed products, products with assignments, unassigned media) and a compact secondary line (total, previewable, ambiguous, global rejects).

---

## Focus mode

Toggle **Focus mode** in the header when you want to work on **one SKU** without scrolling past every product card.

- Hides the full product list; keeps the **Selected product** workspace and the pool.
- When a product is selected, the pool tabs (**Unassigned** / **Ambiguous** / **Confirmed** / **Rejected**) only list media whose matcher **candidates** include that handle (top match or candidate list).
- If Focus mode is on but no product is selected, the UI prompts you to pick a product or turn Focus off.

---

## Inspector

Click **Details** on a pool tile (or an unpreviewable row) to open the **Inspector** beside the pool:

- Large preview (or reason text)
- Filename, full source path, source type, previewability
- Confidence / identity confidence (when a candidate row exists)
- SKU / handle / collection hints
- Short list of matcher candidates
- The same **Primary / Gallery / Ref / Reject** actions for the **currently selected product** (disabled messaging if none selected)

---

## Media pool tabs

| Tab | Contents |
|-----|----------|
| **Unassigned** | Not in any lane and not globally rejected; respects sidebar + “More filters”. |
| **Ambiguous** | Subset with `identity_confidence === ambiguous`. |
| **Confirmed** | Subset with matcher `confidence === confirmed`. |
| **Unpreviewable** | **Compact text list** (no image grid): filename + reason; full path in tooltip / Inspector. |
| **Rejected** | Global rejections only. |

Quick actions: **Primary**, **Gallery**, **Ref**, **Reject** (lane), **Global ✕**. They are disabled until a product is selected; tooltip / copy explains **Select a product first**.

Cap: first **120** items per tab with a message to narrow filters.

---

## Persistence & export

- **localStorage** key: `furniture-legacy-media-assignment-decisions-v1` (unchanged). Payload may be **v2** (`zonesByHandle` + `globalRejections`). Older **v1** blobs are **migrated on load**.
- **Copy / Download** uses `buildExportDocument` — **v2** shape: `version`, `exported_at`, `review_meta`, `products[]`, `global_rejections`, `legacy_assignments_v1_flat`, etc. Same compatibility as before; **does not** write `data/normalized/legacy-media-assignment-decisions.json` automatically — you save the file yourself.

---

## Image preview (allowlisted)

Dev-only proxy: `/qa/legacy-media-assignment-board/preview?rel=…`  
Allowlisted roots — see `src/lib/qa/legacy-media-assignment-preview.ts` (no traversal).

---

## Prerequisites

From repo root when sources change:

```bash
node scripts/build-legacy-media-inventory.mjs
node scripts/build-legacy-media-product-candidate-map.mjs
```

---

## Confidence semantics

See `docs/storefront/legacy-media-product-candidate-map.md`.

---

## Next safe step (out of scope)

A **separate gated executor** may consume approved export JSON — **not** part of this board.
