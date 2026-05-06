# Oxford media review — visual-first QA board

**Scope:** local dev / QA only. **Not** production rollout, **not** full Oxford readiness, **not** white-background certification. Oxford remains **PAUSED** in storefront governance (`catalog-scope.ts` is not changed by this flow).

The page at `/qa/oxford-local-mvp-media-review` is a **designer-oriented media board**: three **separate modes** (tabs), large previews, short human labels, and technical detail only behind **Details** / **Row notes**. Raw JSON is **not** the default surface — use **Export decisions** / **Copy JSON** when finished.

---

## Where to open

- **URL:** `/qa/oxford-local-mvp-media-review`
- **Code:** `apps/storefront/src/app/qa/oxford-local-mvp-media-review/page.tsx` + `OxfordLocalMvpMediaReviewClient.tsx`
- **Human labels helper:** `apps/storefront/src/app/qa/oxford-local-mvp-media-review/oxford-media-review-labels.ts`
- **Data loader:** `apps/storefront/src/lib/qa/oxford-local-mvp-media-review.ts` (reads normalized JSON under `data/normalized/`)

### Prerequisites (artifacts)

From repo root:

1. `node scripts/build-oxford-local-mvp-media-artifacts.mjs` (or `yarn oxford-local-mvp-media:build` from `apps/backend`)
2. Optional pool expansion: `node scripts/expand-oxford-media-source-inventory.mjs` (see `docs/project/oxford-source-expansion-report.md`)

### Data paths: local vs Docker

Same as before: loaders resolve repo root (`docs/project/CODEMAP.md` + `data/normalized/`), or `apps/storefront/qa-data/oxford-local-mvp/*.json` via `node apps/storefront/scripts/sync-oxford-local-mvp-qa-json.mjs` when Docker cannot mount `./data` and `./docs`.

---

## Three modes (tabs)

| Mode | Purpose |
|------|---------|
| **Review by SKU** | Main workflow: pick a SKU in the sticky sidebar, review planned primary + gallery, then tag each **candidate** image (large cards, min ~240px width). |
| **Unassigned images** | **Only** rows with a **working browser preview** — masonry-style grid. Assign to SKU, keep unassigned, do not use, or flag needs review. **Not** mixed with backlog. |
| **Source backlog** | **No** image placeholders. Table triage for manifest-only, source-not-mounted, missing files, external paths. Human **Suggested next step** column (e.g. mount Yandex, find file manually). |

---

## Review by SKU (default)

1. **Sidebar:** search SKU / handle / title; filters include *Needs review*, *Has candidates*, *No primary*, *Missing product*, *Ambiguous only*, *Has decisions*, etc. Each row shows a small thumb, **human status** (Ready / Needs review / Missing product / No media / Ambiguous), candidate count, and how many images already have a decision.
2. **Main panel:** product badge, title, handle, **planned primary** (large), **gallery & backlog** strip (when present).
3. **Candidates grid:** for each image — large preview, short filename, badges (**Confirmed / Probable / Ambiguous**, **Static / PDF / Legacy**, **Interim / White-bg candidate**). Actions: **Primary**, **Gallery**, **Move** (requires Move-to SKU field), **Remove**, **White-bg later**, **Do not use**. **Remove** means *remove from a future assignment*, **not** delete the file on disk or in `data/`. **Flag for manual review** lives under **Details**.

---

## Unassigned images

- If there are **few** previewable unassigned images, the header shows a **yellow callout**: the pool is not the full Oxford catalog — mount **WOODRIGHT/Yandex** or run the expansion script.
- Assign field + **Assign** / **Keep unassigned** / **Do not use** / **Needs review** on each card.

---

## Source backlog

- Summary chips: total backlog, source-not-mounted, manifest-only, missing local file, external absolute paths.
- When **source-not-mounted** rows exist, a calm notice explains that the board is **repo-local until the mirror is mounted**.
- Decisions map to export `backlog_reference_decisions` (`visual_reviewable: false`) as before.

---

## Decisions, export, storage

- **localStorage** key `oxford-local-mvp-media-review-decisions-v1`
- Header shows **reviewed / total**, **recorded decision count** (export to persist), and a short **summary strip** (Primary / Gallery / Move / Remove / White-bg later / Do not use).
- **Export decisions** / **Copy JSON** → save manually as `data/normalized/oxford-local-mvp-media-review-decisions.json` when ready (no server write from this page).

---

## Preview rules (unchanged)

Same server-side rules as before: Medusa static URLs, allowlisted `data/...` via dev-only `GET /qa/oxford-local-mvp-media-review/preview?rel=...`, manifest-only / Yandex paths without a local file → **no `<img>`** in **Unassigned**; those rows appear only under **Source backlog**.

---

## Related

- Plan / inventory: `docs/project/oxford-local-mvp-media-fill-report.md`
- Source expansion: `docs/project/oxford-source-expansion-report.md`
- Table QA: `/qa/oxford-local-mvp-media`
