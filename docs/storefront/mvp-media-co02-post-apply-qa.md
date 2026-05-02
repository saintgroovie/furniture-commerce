# MVP Media CO-02-1 — Post-Apply QA

## Short verdict

**Manual / browser QA closed: OK.** Product **`co-02-1`** shows an **image on the product card** (operator visually confirmed). Automated checks remain aligned: executor evidence, apply report, and Store API **`thumbnail` / `images[0]`** match the expected FILE URL. **`media_status`:** `mvp_temporary_media_visible`. **`--apply` was not re-run** in this closure pass.

Machine-readable output: [`data/normalized/storefront-mvp-media-co02-post-apply-qa.json`](../../data/normalized/storefront-mvp-media-co02-post-apply-qa.json).

## Manual QA confirmation

| Field | Value |
|--------|--------|
| Product handle | **`co-02-1`** |
| Visual result | **Image visible in product card** (one image observed) |
| `media_status` | **`mvp_temporary_media_visible`** |
| Source class | **`temporary_non_white_static_local`** |
| `production_media_claim` | **false** |
| `requires_later_white_background_replacement` | **true** |
| Executor `--apply` | **Not rerun** (no `MVP_MEDIA_ASSIGNMENTS_APPLY_CONFIRM=1` / `ALLOW_TEMPORARY_STATIC` apply in this pass) |

## Automated QA checks (retained)

1. **[`storefront-mvp-media-assignment-executor-dry-run.json`](../../data/normalized/storefront-mvp-media-assignment-executor-dry-run.json)** — `dry_run_only: false`, single `apply_attempt` for CO-02-1, `apply_summary.errors: 0`, **10** `skipped_rows`, expected `target_url`.
2. **[`mvp-media-co02-apply-report.md`](mvp-media-co02-apply-report.md)** / **[`storefront-mvp-media-co02-apply-report.json`](../../data/normalized/storefront-mvp-media-co02-apply-report.json)** — consistent with executor.
3. **Store API** (local, when available) — `GET /store/products/prod_01KNTBXADAKWN6BXHSYFRX0R2F?fields=%2Bmetadata` → `thumbnail` and `images[0].url` match executor `target_url`.

## CO-02-1 Store / Admin media result

| Check | Result |
|--------|--------|
| `handle` | `co-02-1` |
| `thumbnail` | `http://localhost:9000/static/1777716293008-CO-02-1_gallery_01.jpg` |
| `images[0].url` | Same URL as `thumbnail` (rank 0) |
| Match executor `target_url` | Yes |

Gallery ranks **1+** may still reference `/uploads/products/country-london-paris/...` — consistent with executor gallery sync behavior.

## Safety confirmation

- **Apply script scope:** only **`thumbnail`** and **`images`** — not metadata, variants, prices, collections, **`catalog-scope.ts`**, or storefront runtime.
- **This closure pass:** no edits to catalog-scope, metadata payloads, stage/readiness artifacts, or storefront source.
- **Skipped collections / rows:** Oxford, Monchelsea, Willie Winkie, Oliver Kids, and blocked placeholder rows remain **executor-skipped only** — **no** `apply_attempts` outside CO-02-1.

## Mismatch / rollback

- **None.** Rollback only if product media must be reverted intentionally (restore prior `thumbnail` / `images` from snapshot).

## Remaining follow-up

- **White-background replacement** when governed source is available; refresh MVP map + assignment dry-run; optional new pre-apply gate before any further apply.

## Next safe MVP media target

- **None** implied by CO-02-1 alone. Next controlled apply requires a **new** dry-run eligible row, pre-apply gate, and explicit operator intent — **not** Oxford / Monchelsea probable / WW / Oliver / blocked lanes without separate governance.
