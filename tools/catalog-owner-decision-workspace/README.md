# Catalog Owner Decision Workspace

Local, read-only owner UI for category/collection/mirror decisions.

## Hard guarantees

- Does **not** call Medusa admin/store write APIs
- Does **not** apply catalog mutations
- Blank decision = pending
- Agent proposal ≠ approval
- Confirmed no-image rows auto-defer without confirming fields
- Mutation preview returns `no_approved_mutations` when approvals are empty

## Start

```bash
export OWNER_REVIEW_PACKET=/Users/leonidmbp/Documents/projects/woodright-owner-artifacts/catalog-owner-review-20260722T095022Z
export OWNER_REVIEW_MEDIA_FIXTURE=/Users/leonidmbp/Documents/projects/woodright-owner-artifacts/catalog-dq-20260721T1719Z/live-products.fixture.json
export OWNER_REVIEW_WORKSPACE=/Users/leonidmbp/Documents/projects/woodright-owner-artifacts/catalog-owner-decisions-workspace-local
export OWNER_REVIEW_PORT=3051
node tools/catalog-owner-decision-workspace/server.cjs
```

Open `http://127.0.0.1:3051/`.

## Tests

```bash
node tools/catalog-owner-decision-workspace/scripts/run-unit-tests.cjs
node tools/catalog-owner-decision-workspace/scripts/assert-no-write-api.cjs
node scripts/release/validate-owner-decision-workspace.cjs --fixture-dir scripts/release/fixtures/owner-workspace
```
