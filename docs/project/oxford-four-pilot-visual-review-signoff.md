# Oxford-4 pilot visual review signoff

Governance-only pass after commit `85919653` (*Add Oxford visual source analysis*).  
Does **not** run seed, validation, sync, or runner. Does **not** edit post-ingestion evidence JSON.

## Verdict

**OK: OXFORD-4 VISUAL REVIEW SIGNOFF PREPARED** — all four pilot SKUs carry `review_status: approved_for_interim_pilot` with explicit non-readiness limits.

Machine-readable artifact: `data/normalized/oxford-four-pilot-visual-review-signoff.json`.

## Method

- Confirmed each `candidate_path` exists under `apps/backend/static/products/oxford/`.
- Cross-checked `sku`, `handle`, and `canonical_name` against `data/normalized/oxford-visual-candidate-map.json` and pilot seed/manifest context.
- Visual correspondence used tooling-assisted image description (lifestyle PDF extracts, not studio white-background).

## Per-SKU summary

| SKU | `review_status` | `reviewer_confidence` | Notes |
|-----|-----------------|----------------------|--------|
| `OX-14-11` | `approved_for_interim_pilot` | `probable` | Lifestyle loft context; lower-bed SKU not isolated in frame — interim-only. |
| `OX-90-1` | `approved_for_interim_pilot` | `confirmed` | Integrated desk / pull-out study zone matches complex with выдвижной столешницей. |
| `OX-14-1` | `approved_for_interim_pilot` | `probable` | Full Oxford-1 complex shot; distinct from OX-90-1 per separate interim file, not filename alone. |
| `S-OX-05` | `approved_for_interim_pilot` | `confirmed` | Stairs with balusters and drawer steps match ступени с перилами и ящиками (wider scene acceptable for interim). |

## Global constraints (all rows)

- `white_background_source`: **false** — do not treat as white-background.
- `approved_only_for`: **interim_pilot_materialize** — controlled pilot / QA / materialize lane only.
- `not_approved_for`: **media_ready**, **storefront_ready**, **rollout_ready**.
- Oxford collection remains **PAUSED**; no rollout or unpause implied.

## Next safe step

1. Optional: human principal re-sign if marketing requires stricter hero crops (especially `OX-14-11`).
2. Sync/copy required Oxford static binaries into the **validation worktree** as needed.
3. Run Oxford pilot runner / materialize **only** in that controlled context, in a **separate** commit from this signoff.
4. Post-ingestion evidence updates only after a confirmed OK run, via the governed evidence lane — not by hand-editing JSON.
