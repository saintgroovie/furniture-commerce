# Duplicate handle evidence - `a-07-1` (2026-07-30)

Status: **filled from read-only query** on private production-candidate DB
(`woodright-production-backend` → `woodright_production`). No DB write,
no soft-delete undo, no publish, no handle rename.

Machine report companion:
`docs/evidence/public-launch-20260730/duplicate-handle-a-07-1.report.json`

## Classification

| Token | Value |
|-------|-------|
| Buyer-visible published collision | **no** |
| Soft-deleted residue + live draft same handle | **yes** |
| Public-indexable blocker | **no** (no published buyer route) |
| Private-candidate data hygiene | **yes** - owner decision before publish |
| Auto-delete / auto-merge | **forbidden** |

## Records (exact)

### Record A - soft-deleted residue

| Field | Value |
|-------|-------|
| product id | `prod_01KY5SCBG6D21E5PC9Q4DEXJ5Z` |
| handle | `a-07-1` |
| title | Сундук пиратский |
| status | `draft` |
| deleted_at | `2026-07-22T20:48:56.244Z` |
| created_at | `2026-07-22T20:48:23.050Z` |
| variant | `variant_01KY5SCBJNWN3C9N36ZPYGRXW4` SKU `A-07-1` (also soft-deleted) |
| images (non-deleted) | 0 |
| sales channels | none |
| categories | none |
| order line refs | 0 |

### Record B - live draft (canonical candidate if ever published)

| Field | Value |
|-------|-------|
| product id | `prod_01KY5SEY9MMP10REXCZ48C111E` |
| handle | `a-07-1` |
| title | Сундук пиратский |
| status | `draft` |
| deleted_at | `null` |
| created_at | `2026-07-22T20:49:47.832Z` |
| variant | `variant_01KY5SEYBRCTT3CQJ08JW8JBR3` SKU `A-07-1` |
| images (non-deleted) | 1 |
| sales channels | none |
| categories | none |
| order line refs | 0 |

## Interpretation

Same title + same SKU family, ~84s apart. Record A was soft-deleted
~33s after create; Record B created ~51s after A's delete. This looks like
**legacy import residue / accidental re-import**, not two distinct SKUs
that need different public handles today.

Non-deleted duplicate-handle query (`GROUP BY handle HAVING count(*) > 1`
where `deleted_at IS NULL`) returned **empty** - Medusa unique handle among
live rows is currently satisfied because A is soft-deleted.

## Recommended reversible repair (owner approval required - not executed)

1. Keep Record B (`prod_01KY5SEY9MMP10REXCZ48C111E`) as the sole live
   `a-07-1` draft.
2. Leave Record A soft-deleted. Do **not** hard-delete without a separate
   backup + owner approval.
3. Before any publish of `a-07-1`, re-run duplicate gate on published +
   sales-channel-visible rows only.
4. If Record A must be restored for audit, assign a non-colliding handle
   first (e.g. `a-07-1-legacy-import`) via Admin/API dry-run, then
   undelete - never undelete onto a colliding live handle.
5. Redirect plan: none needed today (no published buyer URL).
6. Rollback: re-soft-delete any accidental undelete; restore prior handle
   from evidence IDs above.

## Dry-run sketch (not executed)

```sql
-- READ-ONLY collision check before any publish
SELECT id, handle, status, deleted_at
FROM product
WHERE handle = 'a-07-1'
ORDER BY created_at;

-- Proposed ONLY after owner approval (example - do not run now):
-- UPDATE product SET handle = 'a-07-1-legacy-import'
-- WHERE id = 'prod_01KY5SCBG6D21E5PC9Q4DEXJ5Z';
```

## Owner decision required?

Only if Record A must re-enter the live catalog, or if marketing needs a
different public handle for Record B before publish. For
`private_noindex` candidate deploy: **no publish blocker**.
