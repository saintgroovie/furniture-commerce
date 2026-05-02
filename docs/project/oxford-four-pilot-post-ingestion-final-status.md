# Oxford-4 pilot — final post-run status (governance handoff)

Short record after successful validation run and evidence alignment. **Not** a storefront publish, **not** full Oxford collection readiness, **not** unpause/rollout.

---

## What completed

- **Oxford-4 clean validation runner** finished **OK** in validation worktree `furniture-commerce-oxford-validation` (see full log: `/tmp/woodright-oxford-four-runner.log`).
- Stages: `materialize-static` → `smoke` → `seed` (idempotent; four products already present) → `validate-post-ingestion` → `sync-ingested-evidence` — all passed.

---

## Evidence commits (two repos)

| Location | Commit (full) | Short | Message |
|----------|---------------|-------|---------|
| **Main** `furniture-commerce` | `243d1d7c712d2557ce4793bb3b3a82cd189f8a24` | `243d1d7` | `Close Oxford-4 pilot post-ingestion evidence` |
| **Validation** worktree | `95842132213f69a9f26eb3f8e6f67846e2d976e0` | `9584213` | `Close Oxford-4 pilot post-ingestion evidence` |

Each of those commits contains **only**:

- `data/normalized/oxford-four-pilot-post-ingestion-validation.json`
- `data/normalized/oxford-four-pilot-ingested-evidence.json`

Post-transfer: **SHA256 of both files matches** validation OK-run **byte-for-byte** in main at `243d1d7`.

---

## Validation snapshot (committed report)

From `oxford-four-pilot-post-ingestion-validation.json`:

- `verdict`: `"ok"`
- `violations`: `[]`
- `storefront_pause_contract.ok`: **true** (`oxford` remains in paused set only)
- `pilot_products_in_db.count`: **4**

**Pilot handles:** `ox-14-11`, `ox-90-1`, `ox-14-1`, `s-ox-05`  
**Pilot SKUs:** `OX-14-11`, `OX-90-1`, `OX-14-1`, `S-OX-05`

**Ingested evidence bundle:** `post_ingestion_db_evidence` **ok**; governance sync check **EVIDENCE_JSON_OK** (see `oxford-four-pilot-ingested-evidence.json`).

---

## Explicit non-claims

- **Interim / PDF-derived images are not white-background** and are not asserted as studio-ready.
- **Oxford is not** full **media-ready**, **storefront-ready**, or **rollout-ready** from this lane.
- **Oxford remains PAUSED** in catalog scope contract; no unpause and no public rollout implied by this document.

---

## Out of scope / handoff

- **Smoke artifact** `data/normalized/oxford-four-pilot-ingestion-smoke.json` in validation may exist as **untracked** — do **not** commit without an explicit product decision.
- **Monchelsea / Oliver / Oliver Kids / Willie** and other collections: unchanged by this pilot closure.
- **Next safe actions:** manual QA and evidence review only; any **full Oxford** readiness or **unpause** is a **separate** governance decision after full gates.
