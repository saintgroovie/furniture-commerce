# Oxford local MVP media — visual-first review board

**Scope:** local dev / QA only. **Not** production rollout, **not** full Oxford readiness, **not** white-background readiness. Oxford remains **PAUSED** in storefront governance (`catalog-scope.ts` is not changed by this flow).

The page at `/qa/oxford-local-mvp-media-review` is a **visual-first media board**: large images, SKU sidebar, candidate cards with action buttons, and a separate **unassigned** gallery. Raw JSON and long paths are tucked under **Technical details** / **Details** / **Path** expanders — not the default view.

---

## Where to open

- **URL:** `/qa/oxford-local-mvp-media-review` (в браузере откройте этот путь на dev-сервере storefront; отдельного пункта в главном меню нет). С страницы табличного плана **`/qa/oxford-local-mvp-media`** есть ссылка «Visual-first media review board»; на visual board — обратная ссылка на table QA.
- **Code:** `apps/storefront/src/app/qa/oxford-local-mvp-media-review/page.tsx` (server) + `OxfordLocalMvpMediaReviewClient.tsx` (client)
- **Data loader:** `apps/storefront/src/lib/qa/oxford-local-mvp-media-review.ts` (reads normalized JSON under `data/normalized/`)

Prerequisites: run `node scripts/build-oxford-local-mvp-media-artifacts.mjs` (or `yarn oxford-local-mvp-media:build` from `apps/backend`) so `oxford-local-mvp-media-*.json` exists.

### Data paths: local vs Docker (`process.cwd()=/app`)

Loaders look for:

1. **Resolved repo root** — walk up from `process.cwd()` and from the bundled module path until a directory contains **both** `docs/project/CODEMAP.md` and `data/normalized/`, then read `<root>/data/normalized/oxford-local-mvp-*.json`.
2. **`qa-data` snapshot** — `apps/storefront/qa-data/oxford-local-mvp/*.json` (same basenames as in `data/normalized/`). Optional when the runtime cannot see the full repo tree.
3. **Legacy relative paths** — e.g. `../../data/normalized/...` from a non-container dev cwd.

**Docker Compose (preferred for dev):** the repo `docker-compose.yml` mounts the storefront app as `./apps/storefront:/app` only exposes the app tree, so by default `/app` does **not** include repo `data/` or `docs/`. The storefront service adds **read-only** mounts:

- `./data:/app/data:ro`
- `./docs:/app/docs:ro`

After that, `/app` satisfies the repo markers (`/app/docs/project/CODEMAP.md` and `/app/data/normalized/`), loaders resolve `repo_root=/app`, and the three JSON files are read from `/app/data/normalized/oxford-local-mvp-*.json`. Restart the storefront container after changing compose.

**If you cannot change Docker mounts:** from repo root run:

`node apps/storefront/scripts/sync-oxford-local-mvp-qa-json.mjs`

(or `yarn qa:sync-oxford-local-mvp-json` from `apps/storefront`). That copies **only** the three Oxford local MVP JSON artifacts into `apps/storefront/qa-data/oxford-local-mvp/` (gitignored `*.json`; directory kept via `.gitkeep`). The loader tries those paths when repo root resolution fails.

**Error hint:** `process.cwd()=/app` and `resolved_repo_root=null` means the container (or process) does not see `docs/` + `data/normalized` on one tree — add the compose readonly volumes or run the sync script.

If artifacts are genuinely missing on disk, regenerate **read-only** artifacts from repo root (no DB apply):

`node scripts/build-oxford-local-mvp-media-artifacts.mjs`

---

## Header (quick orientation)

- Title: **Oxford local media review — dev only**
- Badges: **local only**, **Oxford PAUSED**, **non-white / interim allowed for preview**, **no DB writes**
- Progress: **reviewed / total** (any non-`unset` decision counts)
- **Export decisions JSON**, **Copy JSON**, **Clear decisions**

---

## How to review (recommended order)

1. **Pick a SKU** in the left sidebar (search by SKU, handle, title, or filename substring). Use filters such as *Needs review*, *No planned primary*, *Has orphan candidates on SKU*, *Product missing in Medusa*, etc.
2. **Center panel:** read title / SKU / handle, inspect the **large planned primary**, then the **gallery & backlog** strip. Short bullet warnings explain risk in plain language; full machine warnings stay under **Technical details**.
3. **Right column — candidates:** for each image use the big actions: **Primary**, **Gallery**, **Move** (requires “Move to SKU” field), **Remove**, **White-bg later**, **Do not use**, **Review**. The active decision is highlighted on the card. Per-image filename (short), confidence, media class, and source kind appear as badges; full path is under **Details**.
4. **Unassigned Oxford media** (bottom): large grid of inventory not mapped to any SKU row. Set **Assign to SKU** using the field above the grid, then **Assign to SKU** on a card; or **Keep unassigned**, **Do not use**, **Needs review**. Nothing here deletes files on disk.
5. When done, **Export decisions JSON** or **Copy JSON** and save manually as described below.

**`remove_from_assignment`** means: exclude from a **future** Medusa product `images` / primary assignment — **not** deleting the file from disk or from `data/`.

---

## Sidebar filters (SKU list)

| Filter | Intent |
|--------|--------|
| All SKUs | No filter |
| Needs review | Backlog URLs, ambiguous confidence, or any image still `unset` |
| Has / No planned primary | Planned primary present or absent |
| Has orphan candidates on SKU | Any attached image looks orphan-like (`is_orphan`, `match_tier` containing “orphan”, or orphan-related warnings) |
| Ambiguous / backlog items | Gallery backlog or ambiguous confidence on any candidate |
| Status: ambiguous | Row `review_status === has_ambiguous_media` |
| Product missing in Medusa | No product in local DB for that workbook SKU |
| Gallery backlog | Non-empty `gallery_review_backlog_urls` |
| No media candidates | Row status `no_media_candidates` |

List rows show a small primary thumb, **in DB / no product**, and compact counts (orphan-like / confirmed / probable / ambiguous).

---

## Broken preview

If a preview URL fails to load, the UI shows a broken state with a short snippet of the URL and **Needs source/path fix** (tags the image decision as `needs_manual_review` with `reason: preview_load_failed` when a `media_key` is available). Inventory is unchanged.

---

## Decisions (per image)

Same `ReviewDecision` values as before: `keep_as_primary`, `keep_in_gallery`, `move_to_other_sku`, `remove_from_assignment`, `needs_manual_review`, `needs_white_bg_replacement`, `do_not_use`, `unset`.

Storage: **`localStorage`** key `oxford-local-mvp-media-review-decisions-v1` (browser-only until export).

---

## Export / canonical JSON on disk

1. Use **Export decisions JSON** or **Copy JSON** on the page after review.
2. Save the file into the repo (manual step) as:

   `data/normalized/oxford-local-mvp-media-review-decisions.json`

3. Schema reference / starter: `data/normalized/oxford-local-mvp-media-review-decisions.template.json`

There is **no** server write from the storefront in this setup: no dev API route that writes to disk (avoids accidental production misuse). If you add one later, gate it with `NODE_ENV !== "production"`, fixed path only, and JSON shape validation.

---

## Medusa apply

Applying thumbnails/images to Medusa is a **separate gated** task (`oxford-local-mvp-media:apply` with `OXFORD_LOCAL_MVP_MEDIA_APPLY_CONFIRM=1`) after review — **not** triggered from this page.

---

## Related

- Plan / inventory report: `docs/project/oxford-local-mvp-media-fill-report.md`
- Table QA (plan only): `/qa/oxford-local-mvp-media`
