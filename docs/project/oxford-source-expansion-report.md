# Oxford source expansion report

**Generated:** 2026-05-04T01:32:00.822Z  
**Verdict:** Local dev **source discovery / inventory expansion** only — **not** rollout, **not** white-background certification.

## A. Verdict

- Expansion pass indexed **61** Oxford-related image references (after path/hash dedupe).
- **23** are previewable on the storefront review board today (repo-relative allowlisted paths or backend static HTTP).
- **38** are not previewable in-browser from current Next rules (external disk paths, missing files, or non-allowlisted data paths).
- Full white-background Yandex pool requires **WOODRIGHT** mirror mount; see `source_mount_needed_for_full_oxford_media_pool` in `data/normalized/oxford-source-expansion-summary.json`.

## B. Roots scanned / mount status

- Total root probes: **19**
- Mounted: **11**, Missing: **8**
- Details: `oxford-source-expansion-inventory.json` → `roots`.

## C. Oxford images found

- **61** records in expansion inventory.

## D. Previewable vs unpreviewable

- Previewable now: **23**
- Not previewable: **38**

## E. SKU assignment coverage (heuristic buckets)

{
  "orphan_oxford_media": 53,
  "confirmed_sku_match": 8
}

## F. Review board / MVP JSON merge

- Merge MVP artifacts: **yes** (inventory +31, sku candidates +0, plan gallery URLs +0).
- Re-run storefront after merge; ensure repo `data/` is visible to Next (Docker mounts) or sync QA JSON copies.

## G. Artifacts

| Artifact | Purpose |
|----------|---------|
| `data/normalized/oxford-source-expansion-inventory.json` | Full per-file expansion rows |
| `data/normalized/oxford-source-expansion-summary.json` | Counts + mount-needed block |
| `scripts/expand-oxford-media-source-inventory.mjs` | Regenerator |

## H. Safety facts

- No Medusa DB writes; no seed/validation/sync/runner; no media apply.
- No `catalog-scope.ts` edits; no Oxford pilot evidence JSON edits.
- No source image copy/move/delete; no binary commits from this script.

## I. Next manual step

1. Mount Yandex Disk / **WOODRIGHT** paths listed in summary JSON and re-run this script to pull additional bytes + hashes for white-background candidates.
2. Open `/qa/oxford-local-mvp-media-review` and confirm new **unassigned** / SKU rows show previews for new static/repo files.
3. Optional: `node apps/storefront/scripts/sync-oxford-local-mvp-qa-json.mjs` if using Docker without `data/` mount.
