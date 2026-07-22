# Catalog owner-review and mutation dry-run

## Source

Only the authoritative compare packet (e.g. `catalog-dq-authoritative-20260721T203905Z`).

Never use `/store/products` list DTO as completeness evidence.

## Build packet

```sh
node scripts/catalog/build-owner-review-packet.cjs \
  --endpoint-comparison /path/to/endpoint-comparison.json \
  --inventory /path/to/inventory.json \
  --out /path/to/owner-review-dir
```

## Decisions

Agent rows are recommendations. Owner must set:

- approve_proposal
- choose_other
- intentionally_unassigned
- defer
- reject
- needs_more_evidence

`automatic_apply_allowed` stays false until an approved workflow exists.

## Dry-run (no writes)

```sh
node scripts/catalog/dry-run-catalog-mutations.cjs --input decisions-with-snapshot.json
```

Fail-closed on stale fingerprints, bundle mismatch, missing IDs, deferred/rejected rows.

Live apply is out of scope for governance-only cycles.
