# Fix log

1. Fable 5.1 independent review (read-only): auto-triage not safe to apply. P0 surplus-angle drops real second shots; Provence white finish lost; some heroes are detail-crops.
2. Marked `review_meta.status = auto_triage_draft_not_operator_approved`, `do_not_auto_apply: true`, `production_apply: unsafe_scope`, `known_defects[]`.
3. ol-84-1: removed `i2` from `rejectedIds`; dropped duplicate `detail` role on same id; removed stray `i1` roleOverride. Control still: gallery_01 unassigned, i2 kept.
4. Wrote per-handle `drop-ledger.json` (1614 rows).
5. Did **not** apply to Medusa. Did **not** change runtime near-dup (already on `origin/main`).
