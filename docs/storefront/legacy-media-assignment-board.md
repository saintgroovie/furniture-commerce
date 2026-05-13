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

`/qa/legacy-media-assignment-board/api/{inventory,candidates,products,enrich-color-article}` return **200** with the same bodies as before on success (enrich: `GET` smoke JSON, `POST` enrichment body). On failure they return **500** with a machine-readable `error` code (never arbitrary path traversal):

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

## Assisted variants (dev-only)

- Visible delivery sentinel in page chrome (updates with each pass): e.g. `Legacy Board UI color article enrichment + product SKU hint split`.
- Selected product workspace includes **Suggested color variants** derived from legacy filename/path tokens (`color_*`) + candidate map handle/SKU hints.
- **Product SKU hint** (Medusa / seed `medusa_variant_sku`, e.g. `CO-02-1`) is shown separately from **Legacy color article** — the UI never treats the product SKU as the legacy color article.
- **Legacy color article enrichment** (read-only QA): `POST /qa/legacy-media-assignment-board/api/enrich-color-article` with `{ product_sku_hint, color_token, candidate_urls[] }`. The server tries HTML candidate URLs from inventory (`legacy_product_url`, `page_url`, `url` minus direct image URLs) plus seed image URLs (skipped as HTML); parses pages heuristically (JSON-LD + token windows). The parser **also scans hover-related DOM attributes** — `title=`, `aria-label=`, `alt=`, and `data-*=` (filtered to `sku|article|product|variant|color|colour|ref|code`) — and returns a **`source_method`** so the UI shows *via hover-title / aria-label / data-attr / alt / html-text* (null when nothing matched). Statuses: **found** / **not_found** / **unavailable** / **parse_failed**; fetch statuses include **no_urls**, **http_error**, **timeout**, etc. Failures do not block the page; if not found the UI shows `Legacy color article: not found` and **never** substitutes the product SKU.
- Per suggestion (compact card): primary action **Confirm all**, plus **Edit label**, **Edit article**, **Reject**, and a collapsed **Details** drawer. *Details* hides the long content: source URL, source method (hover-title / aria-label / data-attr / alt / html-text), fetch/parse status, legacy color name, filename tokens + reasons, **Use legacy name** / **Use legacy article** toggles.
- The suggestion card itself is compact: **header** — bold label + confidence pill + status pill (`suggested` / `edited`) + article-status pill + `via {source_method}` hint when found; **body** — larger Primary thumbnail with a blue badge + horizontal Gallery strip (max 6 visible, `+N` overflow); **footer** — Confirm all + Edit label + Edit article + Reject + Details. No long source paths or reasons in the visible body. Acceptance: one card stays under ~220px tall on 1440px so the main scenario is visible without scrolling inside the card.
- **Export** `confirmed_variant_sources` rows use snake_case handoff fields (`product_sku_hint`, `legacy_color_name`, `legacy_color_article`, `legacy_color_article_status`, `source_url`, `fetch_status`, `confidence`, `reasons`, flags for use/edit). **localStorage** variants blob also stores `suggestionRowPrefs` for row toggles.
- Gallery order does **not** rely on internal lane drag: assigned lane cards expose explicit **`data-action-button`** controls (move first/last/left/right, set primary, remove / return, plus primary/reference/rejected moves). Those actions render **above** the card’s **Drag** strip so they stay visible; clicks use propagation shields so they are not treated as drag. Internal lane drag remains best-effort only.
- **Selected product workspace layout** is a vertical stack of full-width sections (no cramped flex row): **identity header** (title clamp-2, handle/SKU/collection pills + global counts), **color variants panel** (variant pills + Add variant + compact active-variant summary with collapsed *Why? — source / fetch*), **current main media panel** (`[data-selected-product-main-media="true"]`), **suggested color variants panel** with the review-flow toolbar, **collapsed catalog reference**. The product title, SKU, and color pills no longer share a narrow column with the main-media block.
- **Suggested variants review flow** (`[data-suggested-variants-panel="true"]`): a single toolbar above the cards lets you batch-confirm — **Confirm all (N)** (`data-action-button="suggestions-confirm-all-visible"`), **Confirm high-confidence** (`suggestions-confirm-high`), **Skip product** (`suggestions-skip-product`), **Next product →** (`suggestions-next-product`). A live counter `N suggestions · K confirmed · M left` (`data-suggestions-counter="true"`) and a status pill `Ready to export` / `Needs review` (`data-product-review-status`) summarise progress. *Skip product* and *Next product* call into `goToNextProductWithSuggestions(handle)` which scans `productsFiltered` for the next product with at least one not-yet-confirmed and not-rejected suggested variant. Each **Confirm all** (one card) or batched **Confirm all visible** writes `variantsByHandle[handle][variantKey] = { label, primary, gallery, reference: [], rejected: [] }`, mirrors `variantMetaByHandle` via `variantMetaFromEnrichmentAndSuggestion(..., status: "confirmed")`, points `board.zones[handle]` at the just-confirmed variant, and sets `activeVariantByHandle[handle]` so the Current main media panel jumps to it. After confirmation the user reorders photos with the existing lane controls in Current main media — there is no separate pre-confirm reorder zone.
- The **Current main media** panel renders all four lanes for the active variant as the real `zoneBox` drop targets — **Primary** and **Gallery** are always visible with large actionable `MediaImageCard`s (full Move first/last/left/right · Set as Primary · Move to Reference/Gallery · Reject · Return to Unassigned · Details controls), and **Reference only** + **Rejected for this product** sit below in collapsible `<details>` (auto-open when populated). A persistent **unassigned drop strip** at the bottom lets you return assigned tiles to the pool. The lower duplicate 2-column zone grid has been removed; there is now exactly one Primary / Gallery / Reference / Rejected for each variant.
- **Default storefront seed photos** (`image_urls` from `seed-products.json`) are **not** reference-only: when the matcher finds a legacy **inventory id** for a seed URL (path-tail normalization + handle/SKU-linked inventory rows in `apps/storefront/.../seed-inventory-match.ts`), those ids are **auto-filled** into Primary + Gallery for the **Default** variant when zones are empty, appear in **Current main media** as normal `MediaImageCard`s with a **storefront seed** badge, and use diagnostics / lane actions with source **`selected-product-default`** (from zone `storefront_seed_strip` when moving from pool, or gallery/primary controls with the same source when reordering). **Export** still lists **inventory ids only** in `variant_decisions` / zones — no synthetic `seed:` ids.
- **Unmatched seed URLs** (no inventory row with the same normalized `products/…` key) render as **`StorefrontSeedMediaCard`** in the blue **Default storefront photos** strip inside Current main media: Inspect + Copy URL; lane actions that need an id stay **disabled** with the explicit reason *Seed-only image: no legacy media id matched yet* (no silent buttons).
- Storefront catalog seed URLs also appear in **All storefront seed URLs** (`<details>`) as a link list for audit; editing matched ids happens in Current main media, not only there.
- Adjacent zone-action button grids use `gridTemplateColumns: minmax(0, 1fr) minmax(0, 1fr)` and the `miniBtn` style truncates long labels with ellipsis + `title` tooltip, so cards never visually overlap or intercept each other's clicks regardless of size.

---

## Board mode vs Focus mode

Use the **Board mode** / **Focus mode** toggle in the header (segmented control).

- **Board mode** (default): **Collections** sidebar, **Products** list, **Selected product** workspace, **Media pool** + **Inspector**.
- **Focus mode**: hides the collections sidebar and the full product list so you can concentrate on **one SKU**. The **Selected product** workspace stays central; the **Media pool** remains on the right. When a product is selected, pool tabs respect **Focus** filtering: only inventory whose matcher **candidates** include that handle (same behavior as before). Pool image cards render **larger** in Focus mode. If Focus is on but no product is selected, the UI tells you to switch to Board mode or pick a product first.

**Viewport layout:** The page root is a fixed **`100vh`** column: the sentinel + header + workflow strip stay at the top; the three-column grid (or two in Focus mode) fills the remaining height with **`min-height: 0`** on the grid and columns so **Media pool** tiles scroll inside the right column instead of growing the whole document. The **central column** scrolls its own selected-product workspace (vertical stack of full-width sections — identity / color variants / current main media / suggestions / catalog reference) and never lets the main media block crash into the product title. **Diagnostics** stays below the pool in the right column; collapsed by default it does not steal scroll height from the pool. Long text (diagnostics target snapshots, inspector source paths, suggestion source URLs) uses `overflow-wrap: anywhere` / `word-break: break-word` and middle-truncated rendering so it never spills horizontally outside the right column.

**Compact header / workflow strip:** the sentinel banner, page title, segmented mode toggle, and the four header buttons (**Copy JSON** / **Download JSON** / **Clear local** / **Reset filters**) all sit in a single row at the top, saving roughly 120px of vertical space versus the previous multi-row layout. The stats row collapses **Primary** + **Secondary** counts into one wrapping line and the long export disclaimer is folded into an **Export hint** `<details>` toggle. The workflow strip uses 18px-circle step badges (1 Collection → 2 Product → 3 Review → 4 Assign → 5 Export) with one short summary on the right, so the entire chrome above the workspace never exceeds ~120px on 1440px.

**Right media pool clipping:** the pool grid uses `repeat(auto-fill, minmax(min(144px, 100%), 1fr))` in Board mode (and `min(180px,100%)` in Focus) with **`width` / `max-width: 100%`** on the grid so tracks cannot exceed the aside. **`MediaImageCard`** uses `width: 100%; max-width: cardPx + padding` and a square **aspect-ratio** thumb so cards shrink inside narrow tracks instead of overflowing the right edge. Each grid cell wrapper sets `min-width: 0`. The **Manual assignment** block is a **`<details>`** (collapsed by default) so the pool list gets more vertical space. The Inspector docks at the bottom of the right aside with `max-height: 320px; overflow-y: auto`, so it never steals space from the pool.

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

- **localStorage** keys:
  - `furniture-legacy-media-assignment-decisions-v1` — board-zone decisions (`zonesByHandle` + `globalRejections`). Older **v1** blobs are **migrated on load**.
  - `furniture-legacy-media-assignment-variants-v1` — variant layer: `variantsByHandle`, `variantMetaByHandle`, `activeVariantByHandle`, `rejectedSuggestedVariantsByHandle`, `suggestionRowPrefs`.
- On hydration the board first sets `zonesByHandle` from the decisions key, then **overrides** `variantsByHandle` from the variants key so per-variant lane order wins. `board.zones[handle]` stays mirrored to the active variant after every assignment / reorder.
- **Copy / Download** uses `buildExportDocument` — **v2** shape: `version`, `exported_at`, `review_meta`, `products[]`, `global_rejections`, `legacy_assignments_v1_flat`, etc. The board appends `variant_decisions` (full `variantsByHandle`), `active_variant_by_handle`, and `confirmed_variant_sources`. **Do not** change this shape from the board; compatibility with existing `data/normalized/legacy-media-assignment-decisions.json` is required.
- Gallery order round-trip is verified end-to-end: `variantsByHandle[handle][variantKey].gallery` matches `zonesByHandle[handle].gallery` (for the active variant), survives a hard reload, and on export equals both `variant_decisions[handle][variantKey].gallery` and `products[].gallery_candidates`. Checked for both `__default__` and custom variant keys.
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
