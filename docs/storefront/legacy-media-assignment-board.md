# Legacy media assignment board (dev / QA)

## Purpose

**Visual media assignment** for aligning legacy / front-manifest / repo-local images with **seed-derived** products (`data/normalized/seed-products.json`).  
**Not** production rollout: **no Medusa apply**, no catalog-scope edits, no seed or evidence mutation from this UI. Export JSON is a **handoff artifact** only — the board does **not** run any executor and does **not** update production media.

---

## Open the page

### Host Next (recommended for QA)

- From **`furniture-commerce/apps/storefront`**: `yarn dev` (port often **8000** in package.json, or override `PORT`).
- URL: `http://localhost:<port>/qa/legacy-media-assignment-board`
- `process.cwd()` is the storefront app; resolution walks up to the monorepo root **or** uses `FURNITURE_REPO_ROOT` if set.

### Docker storefront (`docker-compose.yml` in repo root)

The **storefront** service uses `WORKDIR` **`/app`** (the `apps/storefront` bind mount). Repo markers for `getFurnitureRepoDataResolution()` must exist **under that same logical root**:

- `docs/project/CODEMAP.md` → mount host `./docs` at **`/app/docs`** (read-only).
- `data/normalized/` → mount host `./data` at **`/app/data`** (read-only).

Compose sets **`FURNITURE_REPO_ROOT=/app`** so the resolver pins the container root even if walk-up seeds differ.

**After changing compose volumes or env**, recreate the container so Next picks up mounts and env:

```bash
docker compose up -d --force-recreate storefront
```

- URL (default published port): `http://localhost:8000/qa/legacy-media-assignment-board`

Run **`docker compose`** from **`furniture-commerce`** (repo root) so `./data` and `./docs` resolve correctly.

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

**Docker on port 8000:** if `./docs` or `./data` is missing on the host, bind mounts fail or markers are absent → `repo_root_not_resolved` / `missing_file`. Use the repo’s `docker-compose.yml` storefront service (mounts + `FURNITURE_REPO_ROOT=/app`) or host Next as above.

In **production** (`NODE_ENV=production`) the board returns **404** unless `LEGACY_MEDIA_QA_BOARD_ALLOW_PROD=1` (discouraged).

---

## Workflow (numbered header)

The sticky header includes a **five-step workflow** strip:

1. **Choose collection** — Sidebar: **All collections**, a named collection, or **Unknown / unmatched** (media rows where collection hints could not be inferred). Search narrows long collection lists. Badges show **products**, **media**, **matcher candidate rows**, **assigned**, and **ambiguous** counts for that slice.
2. **Select product** — Click a product card or **Review**. The card shows handle, title, SKU, collection badge, thumbnail, assigned/candidate counts, and a **status** pill (e.g. *Needs review*, *Has auto matches*, *Manually edited*, *Ready candidate*, *No candidates*, *Ambiguous*, *Has storefront media*).
3. **Review images** — Use the **Media pool** (tabs below). Prefer **Suggested** when a product is selected to see rows whose matcher **top candidate** matches that handle. Open **Inspector** from a tile for full paths, confidence, and candidate list.
4. **Assign roles** — Only in the **Selected product** panel: **Primary**, **Gallery**, **Reference only**, **Rejected for this product**. Drag from a previewable tile card (the **⋮⋮ Drag** bar is a visual hint, not a required-only handle), use per-card quick actions, or use the **Manual assignment panel** by media id. Assigned lane cards also expose **Return to Unassigned**.
5. **Export JSON** — **Copy JSON** or **Download JSON**. The header explains that export is **local decisions only**, does **not** update Medusa, and where to save the file (see Persistence). Success text appears after copy/download. **Clear local decisions** asks for confirmation first.

The workflow strip also echoes **active collection**, **selected product**, **local decision slot count**, and a short export disclaimer.

---

## Board mode vs Focus mode

Use the **Board mode** / **Focus mode** toggle in the header (segmented control).

- **Board mode** (default): **Collections** sidebar, **Products** list, **Selected product** workspace, **Media pool** + **Inspector**.
- **Focus mode**: hides the collections sidebar and the full product list so you can concentrate on **one SKU**. The **Selected product** workspace stays central; the **Media pool** remains on the right. When a product is selected, pool tabs respect **Focus** filtering: only inventory whose matcher **candidates** include that handle (same behavior as before). Pool image cards render **larger** in Focus mode. If Focus is on but no product is selected, the UI tells you to switch to Board mode or pick a product first.

---

## Media pool tabs

| Tab | Contents |
|-----|----------|
| **Suggested** | Unassigned rows with a matcher **top candidate**. If a product is selected, only rows whose top candidate handle matches that product. |
| **Unassigned** | Not in any lane and not globally rejected; respects sidebar + **More filters**. |
| **Ambiguous** | Subset with `identity_confidence === ambiguous`. |
| **Confirmed** | Subset with matcher `confidence === confirmed`. |
| **Unpreviewable** | **Compact text list only** (no `<img>` grid): filename + humanized reason (local missing / not mounted / no preview rule). Full path in tooltip; click a row to open **Inspector**. |
| **Rejected** | Global rejections only. |

Quick actions: **Primary**, **Gallery**, **Ref**, **Reject** (per-product lane), **Global ✕**. They stay **disabled** until a product is selected; copy explains **Select a product first.**  
If another product already owns an image in a lane, the pool shows **This image is already assigned to …**

Cap: first **120** items per tab with **Showing first 120 images — narrow filters to see more.**

---

## Drag and drop

- The board uses native HTML5 drag-and-drop for previewable tiles. You can grab the card itself; the **⋮⋮ Drag** bar remains as an affordance.
- **Unpreviewable** inventory appears only in the **Unpreviewable** tab as **text rows** — no drag handle there.
- **Drop zones** (Primary / Gallery / Reference / Reject / return strip) expose explicit **`data-legacy-drop-target`** attributes; while dragging, the zone under the pointer **highlights** and the label can switch to a short **“Drop to …”** hint. Releasing outside a valid target **cancels** the drag without changing board state.
- The **Media pool** footer includes a compact **DnD (dev)** block: drag start yes/no, payload written yes/no, last drop target, last action, and last error.
- The diagnostics block also prints last pointer/click/drag/drop targets with resolved `data-*` metadata (`data-media-card`, `data-media-id`, `data-product-handle`, `data-drop-zone`, `data-action-button`) and state-transition telemetry (`state update requested`, `state changed`).
- Diagnostics also include drag context: source (`pool` / `assigned` / `gallery` / `variant`), lane/zone, active variant key, and reorder markers.
- **Quick actions** (**Primary** / **Gallery** / **Ref** / **Reject** / **Global ✕**) remain the full fallback if dragging is inconvenient.
- With **no product selected**, lane targets are not shown; use quick actions after selecting a SKU, or select a product first.

## Manual assignment panel

- Located in the media pool chrome; accepts `media id` + target zone.
- Includes active variant selector; apply targets the selected product + selected variant lane.
- Uses the same immutable assignment flow as drag/buttons.
- Shows active selected product and blocks lane assignment when no product is selected.

## Color variant layer (dev-only)

- Selected product workspace has **Color variants** pills/tabs.
- Each variant has independent lanes: `Primary`, `Gallery`, `Reference`, `Rejected`.
- `Gallery` order is preserved per variant and included in export.
- Existing v2 board decisions remain loadable; default mapping uses `__default__`.

---

## Inspector

Click **Details** on a pool tile (or an unpreviewable row) to open the **Inspector** beside the pool:

- Preview (or failure caption / unpreviewable reason)
- Filename, full source path, source type, previewability (+ humanized unpreviewable reason when applicable)
- Confidence / identity confidence (when a candidate row exists)
- SKU / handle / collection hints
- **Matched candidates** (short list)
- **Primary / Gallery / Ref / Reject** for the **currently selected product** (or **Select a product first.**)

---

## Persistence & export

- **localStorage** key: `furniture-legacy-media-assignment-decisions-v1` (unchanged). Payload may be **v2** (`zonesByHandle` + `globalRejections`). Older **v1** blobs are **migrated on load**.
- **Copy / Download** uses `buildExportDocument` — **v2** shape: `version`, `exported_at`, `review_meta`, `products[]`, `global_rejections`, `legacy_assignments_v1_flat`, etc. **Do not** change this shape from the board; compatibility with existing `data/normalized/legacy-media-assignment-decisions.json` is required.
- The UI reminds you to save manually as **`data/normalized/legacy-media-assignment-decisions.json`** when handing off — the browser **never** writes that path for you.

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

A **separate gated executor** may consume approved export JSON — **not** part of this board and **not** invoked from this UI.
