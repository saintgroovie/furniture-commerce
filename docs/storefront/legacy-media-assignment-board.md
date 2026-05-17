# Legacy media assignment board (dev / QA)

## Purpose

**Visual media assignment** for aligning legacy / front-manifest / repo-local images with **QA product index** rows.  
Default index: `data/normalized/legacy-media-board-products.json` (merges `seed-products.json` + workbook **Oxford** / **Monchelsea** rows without mutating seed). Falls back to `seed-products.json` only if the board index is missing.  
**Not** production rollout: **no Medusa apply**, no catalog-scope edits, no seed or evidence mutation from this UI. Export JSON is a **handoff artifact** only — the board does **not** run any executor and does **not** update production media.

**Oxford / Monchelsea audit:** [`legacy-media-oxford-monchelsea-audit.md`](legacy-media-oxford-monchelsea-audit.md) · regen: `node scripts/build-legacy-media-board-products.mjs` then `build-legacy-media-product-candidate-map.mjs` · `audit-legacy-media-oxford-monchelsea.mjs`.

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

## Active variant media workspace (Primary-first)

For the selected product and **active color variant**, the center column uses explicit lanes:

1. **Главное фото / Primary** — one large slot (~200px). Empty state explains how to set primary via **★ Главное** on a gallery card or **Главное** in the media pool.
2. **Галерея / Gallery** — horizontal scroll strip; cards are **≥180px** wide with compact controls (← → **★ Главное** ✕, **Сделать главным** in ⋯).
3. **Default photos available** — compact 72px thumbnails only when storefront seed URLs are **not** already in Primary/Gallery (no duplicate seed table).
4. **Reference / Rejected** — collapsed `<details>` lanes.
5. **Color suggestions** — below current media; confirm flow unchanged.

**Layout (1440px):** `minmax(220px,260px) | minmax(720px,1fr) | minmax(380px,460px)`; **Focus** mode hides the left sidebar and widens center + pool.

Pool tiles: **Primary** / **Gallery** / **More** (Ref, Reject, Global in More). Manual assignment and Diagnostics stay collapsed.

## Review cockpit UX (operator flow)

The selected-product workspace is organised as an operator **review cockpit**, not a debug console:

- **`[data-review-cockpit="true"]`** — collection, product progress (`N / M` products), status pill (**Нужна проверка** / **Готово к экспорту**), **Prev** / **Next** / **Skip**. Technical workflow counters live under **Workflow debug** in the header strip.
- **`[data-review-canvas="true"]`** — central stack only: **Текущие фото товара** (Primary + Gallery with compact `←` `→` `★ Главное` `✕` chips, badge **Главное фото** on the primary slot, and *More* → **Сделать главным**), **Предложения по цветам** (one primary CTA **Подтвердить вариант** per card; **Изменить** / **Отклонить** / **Почему?** for debug), **Подтверждено вариантов** summary when variants exist.
- **Right column** — **Media pool · N items**; pool cards use `MediaImageCard` `displayMode="pool"` (image-first, no inline paths). **Primary** / **Gallery** + **More** (Ref / Reject / Global). **Manual assignment** and **Debug / Diagnostics** are `<details>` collapsed by default.
- Human-readable legacy article statuses in the UI (e.g. **Артикул найден**, **Старый сайт недоступен**). SKU hint, fetch status, swatch evidence, URLs, and reasons appear only under **Почему?** on suggestion cards.

## Browser QA scripts (dev-only, optional)

Scripts under `apps/storefront/scripts/` drive the board through **system Chrome** via **`playwright-core` installed outside the repo** (no new dependency in `apps/storefront/package.json`, no bundled Chromium download required).

**One-time temp install:**

```bash
mkdir -p /tmp/legacy-board-shot && cd /tmp/legacy-board-shot
npm init -y && npm install playwright-core@1.51.0
```

**Screenshots** (writes PNGs — **do not commit** them):

```bash
cd /tmp/legacy-board-shot
export LEGACY_BOARD_URL=http://127.0.0.1:8000/qa/legacy-media-assignment-board
# optional: LEGACY_BOARD_SCREENSHOT_DIR=/absolute/path (default: <repo>/tmp/qa-screenshots)
# optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or CHROME_PATH
export PLAYWRIGHT_CORE_NODE_MODULES=$PWD/node_modules
node ../furniture-commerce/apps/storefront/scripts/legacy-board-screenshot.mjs
```

**Interaction smoke** (stdout JSON steps only; uses `localStorage` on the board — still dev-only):

```bash
export PLAYWRIGHT_CORE_NODE_MODULES=$PWD/node_modules
node ../furniture-commerce/apps/storefront/scripts/legacy-board-interaction-smoke.mjs
```

Requires `yarn dev` in `apps/storefront` and repo `data/` + `docs/` markers (`FURNITURE_REPO_ROOT` in Docker). Scripts do not call Medusa or mutate seed/catalog/evidence.

## Assisted variants (dev-only)

- Visible delivery sentinel in page chrome (updates with each pass): e.g. `Legacy Board review cockpit UX simplification`.
- **Legacy color article index** (read-only, in-memory / repo cache): `GET|POST /qa/legacy-media-assignment-board/api/legacy-color-article-index`. Registry is built from `data/raw/legacy/cache/*.html`, `data/raw/legacy/legacy-products.json`, `data/raw/legacy/greenwich-products.json`, `data/normalized/image-map.after-front.json` `legacy_page_url`, and inventory `page_url` / `legacy_product_url` hints. Page kinds: `pdp_with_swatches`, `listing_only`, `unknown`, `unreachable`. Listing/sidebar filter pages are never used as swatch article sources. `POST enrich-color-article` prefers a PDP cache match for the same product identity (handle/SKU/candidate URL) before live fetch. UI: **Legacy article index scan** panel (`data-article-scan-panel`) with **Scan visible products** / **Scan current collection** (non-blocking; progress in panel + `localStorage` key `furniture-legacy-article-scan-v1`). Suggestion cards show **Legacy article: {code} · {method}** or indexed miss reasons; **Use indexed article** / **Use indexed name** / **Choose article…** (multi-candidate) / **Edit article**; Details shows matched PDP URL, cache path, swatch evidence, rejected candidates. Product SKU hint stays separate and is never used as the legacy color article.
- Selected product workspace includes **Suggested color variants** derived from legacy filename/path tokens (`color_*`) + candidate map handle/SKU hints.
- **Product SKU hint** (Medusa / seed `medusa_variant_sku`, e.g. `CO-02-1`) is shown separately from **Legacy color article** — the UI never treats the product SKU as the legacy color article.
- **Legacy color article enrichment** (read-only QA): `POST /qa/legacy-media-assignment-board/api/enrich-color-article` with `{ product_handle, product_sku_hint, color_token, filename_color_token, candidate_map_sku, candidate_urls[] | {url,source}[], hover_evidence[] }`. URL audit collects inventory URLs (`legacy_product_url`, `page_url`, `url`), client-passed candidates, and (read-only) `image-map.after-front.json` `legacy_page_url` plus `legacy-products.json` `page_url` when inventory has no HTML page. The API probes each URL and returns `urls_checked[]` (source, fetch_status, HTTP code, reachable_from_api). When live fetch fails in dev, it may read `data/raw/legacy/cache/{md5(url)}.html`. Static HTML parsing prefers CS-Cart swatch wrappers (`ty-product-options__image--wrapper` `title`, `ty-product-option-child` labels, laminate codes like G503), then embedded JSON hints, then generic swatch tags (`title`, `aria-label`, `alt`, `data-*`) — **never** product SKU / handle / filename token / candidate-map SKU as `legacy_color_article`. Each swatch row in the response includes `selector_hint`, `source_method`, `article`, `color_name`, `color_token_match`, and a raw snippet. Optional `hover_evidence[]` accepts output from a host Playwright script (not in repo). Statuses: **found** / **not_found** / **legacy_fetch_unreachable** / **parse_failed** / **hover_required**. Network failure or timeout → `legacy_fetch_unreachable` (not `not_found`). Page reachable but article only on hover → `hover_required`. UI shows **Product SKU hint**, **Filename token**, and **Candidate map SKU** separately from **Legacy color article**. **Use legacy article** is enabled only when status is **found**.
- Per suggestion (compact card): primary action **Confirm all**, plus **Edit label**, **Edit article**, **Reject**, and a collapsed **Details** drawer. *Details* hides the long content: source URL, source method (hover-title / aria-label / data-attr / alt / html-text), fetch/parse status, legacy color name, filename tokens + reasons, **Use legacy name** / **Use legacy article** toggles.
- The suggestion card itself is compact: **header** — bold label + confidence pill + status pill (`suggested` / `edited`) + article-status pill + `via {source_method}` hint when found; **body** — larger Primary thumbnail with a blue badge + horizontal Gallery strip (max 6 visible, `+N` overflow); **footer** — Confirm all + Edit label + Edit article + Reject + Details. No long source paths or reasons in the visible body. Acceptance: one card stays under ~220px tall on 1440px so the main scenario is visible without scrolling inside the card.
- **Export** `confirmed_variant_sources` rows use snake_case handoff fields (`product_sku_hint`, `legacy_color_name`, `legacy_color_article`, `legacy_color_article_status`, `source_url`, `fetch_status`, `confidence`, `reasons`, flags for use/edit). **localStorage** variants blob also stores `suggestionRowPrefs` for row toggles.
- Gallery order does **not** rely on internal lane drag: assigned lane cards expose explicit **`data-action-button`** controls (move first/last/left/right, set primary, remove / return, plus primary/reference/rejected moves). Those actions render **above** the card’s **Drag** strip so they stay visible; clicks use propagation shields so they are not treated as drag. Internal lane drag remains best-effort only.
- **Selected product workspace layout** is a vertical stack of full-width sections (no cramped flex row): **identity header** (title clamp-2, handle/SKU/collection pills + global counts), **color variants panel** (variant pills + Add variant + compact active-variant summary with collapsed *Why? — source / fetch*), **current main media panel** (`[data-selected-product-main-media="true"]`), **suggested color variants panel** with the review-flow toolbar, **collapsed catalog reference**. The product title, SKU, and color pills no longer share a narrow column with the main-media block.
- **Suggested variants review flow** (`[data-suggested-variants-panel="true"]`): a single toolbar above the cards lets you batch-confirm — **Confirm all (N)** (`data-action-button="suggestions-confirm-all-visible"`), **Confirm high-confidence** (`suggestions-confirm-high`), **Skip product** (`suggestions-skip-product`), **Next product →** (`suggestions-next-product`). A live counter `N suggestions · K confirmed · M left` (`data-suggestions-counter="true"`) and a status pill `Ready to export` / `Needs review` (`data-product-review-status`) summarise progress. *Skip product* and *Next product* call into `goToNextProductWithSuggestions(handle)` which scans `productsFiltered` for the next product with at least one not-yet-confirmed and not-rejected suggested variant. Each **Confirm all** (one card) or batched **Confirm all visible** writes `variantsByHandle[handle][variantKey] = { label, primary, gallery, reference: [], rejected: [] }`, mirrors `variantMetaByHandle` via `variantMetaFromEnrichmentAndSuggestion(..., status: "confirmed")`, points `board.zones[handle]` at the just-confirmed variant, and sets `activeVariantByHandle[handle]` so the Current main media panel jumps to it. After confirmation the user reorders photos with the existing lane controls in Current main media — there is no separate pre-confirm reorder zone.
- The **Current main media** panel renders all four lanes for the active variant as the real `zoneBox` drop targets — **Primary** and **Gallery** are always visible with large actionable `MediaImageCard`s (full Move first/last/left/right · Set as Primary · Move to Reference/Gallery · Reject · Return to Unassigned · Details controls), and **Reference only** + **Rejected for this product** sit below in collapsible `<details>` (auto-open when populated). A persistent **unassigned drop strip** at the bottom lets you return assigned tiles to the pool. The lower duplicate 2-column zone grid has been removed; there is now exactly one Primary / Gallery / Reference / Rejected for each variant.
- **Default storefront seed photos** (`image_urls` from `seed-products.json`) are **not** reference-only: when the matcher finds a legacy **inventory id** for a seed URL (path-tail normalization + handle/SKU-linked inventory rows in `apps/storefront/.../seed-inventory-match.ts`), those ids are **auto-filled** into Primary + Gallery for the **Default** variant when zones are empty, appear in **Current main media** as normal `MediaImageCard`s with a **storefront seed** badge, and use diagnostics / lane actions with source **`selected-product-default`** (from zone `storefront_seed_strip` when moving from pool, or gallery/primary controls with the same source when reordering). **Export** still lists **inventory ids only** in `variant_decisions` / zones — no synthetic `seed:` ids.
- **Unmatched seed URLs** (no inventory row with the same normalized `products/…` key) render as **`StorefrontSeedMediaCard`** in the blue **Default storefront photos** strip inside Current main media: Inspect + Copy URL; lane actions that need an id stay **disabled** with the explicit reason *Seed-only image: no legacy media id matched yet* (no silent buttons).
- **Suggested variants for this SKU** use `suggestion-product-guard.ts`: media are grouped by `color_*` filename token only when `classifyMediaProductIdentity` returns **`this_sku`** (exact handle/sku, top candidate, or path token). Rows with another product’s handle/sku or weak candidate overlap go to **Needs identity review** (`color_*__review`) and are **excluded from Confirm all / Confirm high-confidence**. Color token alone never pulls another SKU into bulk confirm.
- Storefront catalog seed URLs also appear in **All storefront seed URLs** (`<details>`) as a link list for audit; editing matched ids happens in Current main media, not only there.
- Adjacent zone-action button grids use `gridTemplateColumns: minmax(0, 1fr) minmax(0, 1fr)` and the `miniBtn` style truncates long labels with ellipsis + `title` tooltip, so cards never visually overlap or intercept each other's clicks regardless of size.

---

## Board mode vs Focus mode

Use the **Board mode** / **Focus mode** toggle in the header (segmented control).

- **Board mode** (default): **Collections** sidebar, **Products** list, **Selected product** workspace, **Media pool** + **Inspector**.
- **Focus mode**: hides the collections sidebar and the full product list so you can concentrate on **one SKU**. The **Selected product** workspace stays central; the **Media pool** remains on the right. When a product is selected, pool tabs respect **Focus** filtering: only inventory whose matcher **candidates** include that handle (same behavior as before). Pool image cards render **larger** in Focus mode. If Focus is on but no product is selected, the UI tells you to switch to Board mode or pick a product first.

**Viewport layout:** The page root is a fixed **`100vh`** column: the sentinel + header + workflow strip stay at the top; the three-column grid (or two in Focus mode) fills the remaining height with **`min-height: 0`** on the grid and columns so **Media pool** tiles scroll inside the right column instead of growing the whole document. The board **breaks out of the storefront `.container` (1200px)** via `legacy-media-assignment-board-page.css` so the QA workspace uses the full browser width. Grid tracks: **collections** `clamp(240px, 18vw, 320px)` · **workspace** `minmax(560px, 1fr)` · **media pool** `clamp(420px, 30vw, 560px)` with **16px** gap (Focus mode drops the collections column). The **central column** scrolls its own selected-product workspace (vertical stack of full-width sections — identity / color variants / current main media / suggestions / catalog reference) and never lets the main media block crash into the product title. **Diagnostics** stays below the pool in the right column; collapsed by default it does not steal scroll height from the pool. Long text (diagnostics target snapshots, inspector source paths, suggestion source URLs) uses `overflow-wrap: anywhere` / `word-break: break-word` and middle-truncated rendering so it never spills horizontally outside the right column.

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
- On hydration the board first sets `zonesByHandle` from the decisions key, then **overrides** `variantsByHandle` from the variants key so per-variant lane order wins. `board.zones[handle]` mirrors **only the active variant**; inactive variant galleries live in `variantsByHandle[handle][variantKey].gallery` and are not overwritten on switch.
- **Gallery order source of truth:** `variantsByHandle[handle][variantKey].gallery` (array order = user-visible order). **Visual-role ranking:** Primary = color-specific **closed_front** / **front_anfas** (straight `i1`, `color_*_01`, `gallery_01`) before **front_3_4** (`i2`, `iso`, angle). Gallery: alternate external (анфас then 3/4) → interior → detail → lifestyle. **Same-SKU borrow** only for `interior` / `detail` / `lifestyle` — never hero/front/anfas/3-4 from another color (rejected candidates logged in proof JSON). Badge `из этого SKU · другой цвет` only on borrowable roles. Manual/recommended order still protected from silent sync. **Role dedupe (suggestions):** one representative per visual role; extra front/hero near-duplicates collapse to `+N похожих скрыто` (not added to the card strip). **Same-SKU borrow:** if a color lacks `interior` / `detail` / `lifestyle` / `scheme`, the board may suggest media from another color of the **same handle/SKU only** (`classifyMediaProductIdentity` must be `this_sku`); badge `из этого SKU · другой цвет`. Never borrows primary/front from another color. **Label priority:** user-edited / confirmed label → legacy name → token fallback; re-suggest must not revert e.g. `Молочный` → `Кремовый`. **Manual order wins:** `galleryOrderSource: "manual"` or `"recommended"` (after **Упорядочить по типам фото**) blocks silent re-sort on confirm-all / reload. QA-only `galleryOrderSource` / `galleryOrderLocked` are **not** exported.
- Auto-hydrate from storefront seeds runs only for `__default__` when all lanes are empty **and** no color variant on that handle already has a non-empty manual gallery. `confirmAllForSuggestions` skips media replacement when a variant already has an established order.
- Missing inventory rows or broken `/preview` URLs show a placeholder (filename + reason) and may fall back to the matched storefront seed URL for thumbnails.
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

## Rules sync (QA preview / apply)

Board-wide dry-run and optional apply for current rules (identity, visual roles, dedupe, same-SKU borrow, label/order protection). See [`legacy-media-board-sync-rules.md`](legacy-media-board-sync-rules.md).

- UI: **Синхронизировать по правилам** on the review canvas.
- Module: `legacy-board-sync-rules.ts`
- Script: `node apps/storefront/scripts/legacy-board-sync-preview.mjs`

---

## Next safe step (out of scope)

A **separate gated executor** may consume approved export JSON — **not** part of this board and **not** invoked from this UI.
