# Oxford local MVP media — visual review page

**Scope:** local dev / QA only. **Not** production rollout, **not** full Oxford readiness, **not** white-background readiness. Oxford remains **PAUSED** in storefront governance (`catalog-scope.ts` is not changed by this flow).

---

## Where to open

- **URL:** `/qa/oxford-local-mvp-media-review`
- **Code:** `apps/storefront/src/app/qa/oxford-local-mvp-media-review/page.tsx` (server) + `OxfordLocalMvpMediaReviewClient.tsx` (client)
- **Data loader:** `apps/storefront/src/lib/qa/oxford-local-mvp-media-review.ts` (reads normalized JSON under `data/normalized/`)

Prerequisites: run `node scripts/build-oxford-local-mvp-media-artifacts.mjs` (or `yarn oxford-local-mvp-media:build` from `apps/backend`) so `oxford-local-mvp-media-*.json` exists.

---

## What you see

- **Summary counters:** SKU rows, local Medusa hits, missing products, inventory size, confidence mix, gallery-backlog rows, orphan/unmapped count.
- **Orphan / unassigned:** inventory records not attached to any SKU candidate row — nothing is deleted from disk.
- **SKU cards:** title, Medusa present/missing badge, `review_status`, planned primary, gallery/candidates/backlog thumbnails, per-image metadata.
- **Preview:** HTTP URLs under Medusa `/static/` render in the browser; repo-only paths (e.g. raw `data/raw/...`) show a “no preview” placeholder — open files locally if needed.

---

## `review_status` on SKU rows

| Status | Meaning |
|--------|---------|
| `product_missing_for_media_assignment` | Workbook SKU has no product in local Medusa — do not auto-create from this page. |
| `no_media_candidates` | No media_items after merge. |
| `has_ambiguous_media` | Ambiguous confidence on a candidate and/or non-empty `gallery_review_backlog_urls`. |
| `has_only_interim_media` | All attached visuals are interim / PDF / legacy class (non white-bg). |
| `ready_for_visual_review` | Default “ok to eyeball” bucket. |

---

## Decisions (per image)

Each image has a **Decision** select:

- `keep_as_primary` / `keep_in_gallery` / `move_to_other_sku` / `remove_from_assignment` / `needs_manual_review` / `needs_white_bg_replacement` / `do_not_use`

**`remove_from_assignment`** means: exclude from a **future** Medusa product `images` / primary assignment — **not** deleting the file from disk or from `data/`.

Optional **Target SKU** when moving. **Reviewer note** and **needs_white_bg_replacement** checkbox for export.

Storage: **`localStorage`** key `oxford-local-mvp-media-review-decisions-v1` (browser-only until export).

---

## Export / canonical JSON on disk

1. Use **Download decisions JSON** or **Copy JSON** on the page after review.
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
