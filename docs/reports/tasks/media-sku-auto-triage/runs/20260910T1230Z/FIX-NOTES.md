# FIX-NOTES - 20260910T1230Z (Fable 5.1 triage-v2, pixel-verified)

Status: **applied to local `:9000`** (63 SKU, 2026-09-10T10:05Z) after snapshot + fail-closed dry-run.
0935Z 94-SKU board remains on SKU that this run **holds** (fabric Oliver, Provence dual-finish, placeholders).
Detail-crop note: 11 `_main` crops on the contact sheet; **10** are in ship-now, `ol-57-2` is held (fabric workbook).

## Machine artifacts (gitignored tmp, worktree `media-sku-auto-triage-20260910`)

`tmp/media-ops-codex-review/apply-ready-fable-fix/`

- `triage-v2.py` - runnable (`python3 triage-v2.py`, `--calibrate <handle>...`). PIL + numpy only.
- `full-v2board-state.json` (121 KB) - all 108 seed products, incl. hold drafts and CLP gold passthrough
- `ship-now-v2board-state.json` (54 KB) - **63 SKU**, `oliver` / `oliver-kids` / `provence` only
- `hold-for-operator.json` - 45 handles with reasons (copy in this dir)
- `gate-report.json` - P0/P1 gates + 11-handle self-check (copy in this dir)
- `board-validation.json`, `triage-summary.json` (per-handle kept/hero/predicted thumbnail), `image-feature-cache.json`
- `drop-ledger.json` in the same dir is **not** produced by this script (left over from the 0935Z loop, 12:33).

Note: the 0935Z loop wrote its own `triage-v2.py` and boards to the same tmp path at 12:33-12:34;
this run overwrote them at 12:39+. The 0935Z board actually applied to `:9000` survives at
`/Users/leonidmbp/.woodright/worktrees/runtime-candidate-main/tmp/media-ops-codex-review/apply-ready-fable-fix/ship-now-v2board-state.json` (94 SKU).

Inputs read-only: worktree `data/normalized/legacy-media-inventory.json` + candidate map + collapse JSON;
`seed-products.json`, CLP gold export and all image pixels from the Documents canonical checkout
(worktree has no `apps/backend/static` / `data/raw` binaries). Nothing written outside this run dir and tmp.

## What v2 does differently (why 63, not 94)

1. **Pixel content, not filename slots.** DCT pHash (hamming <= 6) clusters near-dups; per frame:
   `live` / `in_situ` / `detail` (fg >= 0.92 + >= 3 borders touched) / `scheme` (achromatic, low fill).
2. **Hero never a detail crop.** 11 Oliver `_main.jpg` files are macro detail crops
   (`OL-05-1, 05-3, 30-1, 44-2, 57-2, 61-1, 61-2, 68-1, 69-1, 69-2, 69-4`) - verified on a contact sheet.
   v2 hero = full product frame (`gallery_02` / `gallery_01`), `_main` demoted to `detail` role.
   The 0935Z board applied those `_main` crops as hero (its P1 self-check was filename-based).
3. **Second live angle kept.** Solver keeps every distinct live cluster; surplus drop only for exact hash dups,
   processed/legacy copies, unpreviewable/tiny, PDF-extracts, schemes, cross-SKU, collapse `drop_basenames`.
   Ship-now: 49/63 with a second live angle, 52/63 with any second frame, 11 single-frame SKUs.
4. **Collapse JSON authoritative.** `keep_basename` forced kept, `drop_basenames` rejected, `do_not_collapse` respected.
   Known false positive kept as-is: `pv-23-1` `gallery_02` (green damask) vs `-i2` (mint) - hamming 2, different upholstery; followed rule 1.
5. **Backend prediction as constraint.** Ported `classifyBuyerRole` / `pickBuyerThumbnail` / Provence
   `pv_profile` + `pv_bucket` + dual-finish evidence. A board ships only if the backend would render the
   pixel-correct thumbnail and finish split from the exported filenames.
6. **Colour / fabric tokens.** `color_<family>_NN`, `-lillian-050`, `- lorna-080` etc. never cluster across
   tokens (untagged `gallery_*` may join one token but cannot bridge two). Each token becomes a variant key.

## Hold reasons (non-CLP, 32 handles)

- `multi_color_token_workbook_needs_execution_contract` (19): `ol-07-1, 14-1, 14-2, 15-1, 15-2, 16-1, 16-2, 17-1, 17-2, 17-3, 18-1, 18-2, 23-1, 55-1, 55-2, 56-1, 57-1, 57-2, 82-1`.
  Upholstered beds/chairs with 2-51 fabric frames (lillian / lorna / leona / linda / torno). Full board keeps
  every fabric frame as its own variant; ship needs an execution/variant contract in Medusa.
  0935Z applied these as 1-5 frames (e.g. `ol-16-1` 18 frames -> 1).
- `provence_dual_finish_not_detected_by_backend` / `provence_slot_bucket_mismatch` (8):
  `pv-05-2, 06-2, 08-2, 09-1, 55-1, 61-1, 62-1, 65-8`. Pixels say white + wood, but the backend standard
  profile buckets `-i2`/`gallery_02`/`_main` as wood while collapse rule 1 keeps `-i2` (white) and drops `gallery_02`
  which the backend needs as evidence. Full board keeps cream/wood variants correctly; needs a backend decision
  (metadata override or profile fix) before apply. `pv-42-2` ships as dual only because a near-dup twin
  (`gallery_01` + `-i1`) is kept for evidence (warning `near_dup_twin_kept_for_backend_finish_evidence`).
- `mixed_foreground_aspect` (2): `ol-25-1` (`gallery_04` is a different product - hutch), `ol-83-1` (`_main` shows a board on a chest).
- `no_live_hero` (2): `pv-14-1` (placeholder "Фото временно отсутствует"), `pv-68-1` (tiny legacy PNG only). 0935Z applied both.
- `handle_non_latin_data_issue_skip_photo_apply`: `ol-05-н`.
- CLP `co-*` (13): operator gold 2026-06-23 passthrough, `clp_operator_gold_2026-06-23_do_not_override`.

## Self-check (all 11 ok)

`ol-84-1` = `OL-84-1_main.jpg` + `ol-84-1-i2.jpg` (in-situ frame, operator control), `gallery_01` rejected.
`ol-05-1` / `ol-69-1` hero `gallery_02`, `_main` -> detail. `ol-25-1` line drawing `gallery_03` rejected (scheme).
`pv-05-2` / `pv-06-2` white `gallery_01` + `-i2` kept (full board). `pv-02-1, 09-1, 23-1, 65-5, 65-8` all live angles kept.
Control `av-05-1` not in seed (not evaluated).

## Apply path for Grok (not done here)

- `apply-ship-now-v2board.ts` (runtime `runtime-candidate-main`, photo-only, fail-closed `localhost:9000` + `medusa-store`)
  reads `tmp/media-ops-codex-review/apply-ready-fable-fix/ship-now-v2board-state.json` **relative to its own repo root**;
  copy this run's ship-now JSON there, dry-run (`SHIP_NOW_TRIAGE_DRY_RUN=1 SHIP_NOW_TRIAGE_CONFIRM=1`), then apply.
- `apply-legacy-assign-prefill.ts` is **not** suitable as-is (fixed prefill paths, Provence paint-wood rewrite).
- Production apply: `unsafe_scope`.
