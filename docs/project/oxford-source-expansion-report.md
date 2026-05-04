# Oxford source expansion report

**Generated:** 2026-05-04T01:46:48.995Z  
**Verdict:** Local dev **source discovery / inventory expansion** only — **not** rollout, **not** white-background certification.

## A. Verdict

- Expansion pass indexed **61** Oxford-related image references (after path/hash dedupe).
- **23** are previewable on the storefront review board today (repo-relative allowlisted paths or backend static HTTP).
- **38** are not previewable in-browser from current Next rules (external disk paths, missing files, or non-allowlisted data paths).
- Full white-background Yandex pool requires **WOODRIGHT** mirror mount **or** an explicit operator path; see `source_mount_needed_for_full_oxford_media_pool` and `operator_provided_roots` in `data/normalized/oxford-source-expansion-summary.json`.
- Records under an operator-mounted root outside repo/`data/` include warning `preview_allowlist_followup_needed_for_operator_root` (**0** rows this run) — inventory only until a separate preview-allowlist change is approved.

## B. Operator-provided WOODRIGHT / white-background root

- **Env (not committed, machine-local):** `WOODRIGHT_WHITE_BG_ROOT` (single path) and/or `WOODRIGHT_WHITE_BG_ROOTS` (multiple paths, `:` separator on Unix).
- **Example:** `WOODRIGHT_WHITE_BG_ROOT="/actual/path/to/Фото на белом фоне" node scripts/expand-oxford-media-source-inventory.mjs`
- **This run — operator roots configured:** *(none)*
- **Mounted:** 0, **missing / not found:** 0 (see `roots` entries with `role: "operator_provided_root"` and `operator_root_missing`).
- Paths may contain **spaces** or **Cyrillic**; the script normalizes via `path.normalize` and uses Node `fs` only (read-only).

## C. Roots scanned / mount status

- Total root probes: **19**
- Mounted: **11**, Missing: **8**
- Details: `oxford-source-expansion-inventory.json` → `roots`.

## D. Oxford images found

- **61** records in expansion inventory.

## E. Previewable vs unpreviewable

- Previewable now: **23**
- Not previewable: **38**

## F. SKU assignment coverage (heuristic buckets)

{
  "orphan_oxford_media": 53,
  "confirmed_sku_match": 8
}

## G. Review board / MVP JSON merge

- Merge MVP artifacts: **yes** (inventory +0, sku candidates +0, plan gallery URLs +0).
- Re-run storefront after merge; ensure repo `data/` is visible to Next (Docker mounts) or sync QA JSON copies.

## H. Artifacts

| Artifact | Purpose |
|----------|---------|
| `data/normalized/oxford-source-expansion-inventory.json` | Full per-file expansion rows |
| `data/normalized/oxford-source-expansion-summary.json` | Counts + mount-needed block |
| `scripts/expand-oxford-media-source-inventory.mjs` | Regenerator |

## I. Safety facts

- No Medusa DB writes; no seed/validation/sync/runner; no media apply.
- No `catalog-scope.ts` edits; no Oxford pilot evidence JSON edits.
- No source image copy/move/delete; no binary commits from this script.
- Operator `WOODRIGHT_*` paths live only in your shell env or local docs — **do not** commit `.env` with real disk paths unless your team policy allows it.

## J. Next manual step

1. Mount Yandex / locate **Фото на белом фоне**, then either rely on default probes or set `WOODRIGHT_WHITE_BG_ROOT` to the **actual** directory and re-run this script.
2. Open `/qa/oxford-local-mvp-media-review` — operator-root files appear in **inventory** first; in-browser preview for absolute paths is a **separate** allowlist task if needed.
3. Optional: `node apps/storefront/scripts/sync-oxford-local-mvp-qa-json.mjs` if using Docker without `data/` mount.
