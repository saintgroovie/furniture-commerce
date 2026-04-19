# Collection technical/media readiness rollout (initial)

## Snapshot scope

This is the initial reusable-rollout snapshot after Oliver closure. It is an audit/status pass, not a mass-fix pass.

- Oliver closure remains validated on the reference stack.
- Greenwich is not reopened in this rollout.
- Any mismatch on other environments should be treated as environment/deploy diagnostic first.

## Collection discovery

Current normalized seed data (`data/normalized/seed-products.fixed2.json`) contains:

- `oliver` — 67 rows
- `provence` — 29 rows
- `country-london-paris` — 13 rows

Current storefront scope rules (`apps/storefront/src/lib/catalog-scope.ts`) define:

- Active keys: `greenwich`, `oliver`, `oliver-adult`, `oliver-kids`, `willie-winkie`, `monchelsea`
- Paused keys: `princess-rose`, `country-london-paris`, `oxford`, `provence`

## Initial status matrix

| Collection | Data presence | Readiness status | Notes |
|---|---:|---|---|
| `oliver` | 67 | `OK` | Closed on validated reference stack; do not reopen without new systemic evidence. |
| `country-london-paris` | 13 | `needs manual review` | Seed-level metadata/media/order indicators are clean; collection is paused in catalog scope and needs explicit rollout decision. |
| `provence` | 29 | `needs manual review` | Seed-level metadata/media/order indicators are clean; collection is paused in catalog scope and needs explicit rollout decision. |
| `greenwich` | n/a in current fixed2 snapshot | `needs manual review` | Existing evidence says technically OK; outside this rollout pass by requirement (no reopen). |
| `willie-winkie` | 0 in current fixed2 snapshot | `needs manual review` | Active scope key exists; requires data-presence + readiness audit before enabling collection-level sign-off. |
| `monchelsea` | 0 in current fixed2 snapshot | `needs manual review` | Active scope key exists; requires data-presence + readiness audit before enabling collection-level sign-off. |
| `oliver-adult` | 0 in current fixed2 snapshot | `needs manual review` | Scope key exists; adult/kids split not modeled in current Oliver closure baseline. |
| `oliver-kids` | 0 in current fixed2 snapshot | `needs manual review` | Scope key exists; adult/kids split not modeled in current Oliver closure baseline. |
| `princess-rose` | 0 in current fixed2 snapshot | `needs manual review` | Paused scope key; no readiness audit data in this pass. |
| `oxford` | 0 in current fixed2 snapshot | `needs manual review` | Paused scope key; no readiness audit data in this pass. |

## Repeated cross-collection patterns

- Metadata contract and `/static/...` media path pattern are already aligned in current fixed2 collections.
- Catalog scope (`active` vs `paused`) is currently the main cross-collection gating factor.
- Missing data presence for several scope keys means readiness cannot be inferred without separate ingest/seed presence checks.

## Grouped fixes vs edge cases

### Candidate grouped (mass) fixes

- A generic backend script to backfill metadata contract by collection handle map.
- A generic backend script to normalize media URL segments per collection.
- A generic backend audit report script for `thumbnail` vs `images[0]` drift.

### Collection-specific edge cases

- Split semantics (e.g. `oliver-adult`/`oliver-kids`) and display grouping assumptions.
- Visual no-photo behavior and manual browser sign-off gates per collection.

## Next safe execution mode

Before mass fixes, run a dedicated isolated pass that only adds generic audit scripts and machine-readable audit output (no data mutation). Then apply grouped fixes collection-by-collection where the audit explicitly marks non-OK statuses.
