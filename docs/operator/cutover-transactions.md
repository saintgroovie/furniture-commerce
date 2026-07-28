# Cutover transactions (Woodright)

## Canonical lock

`/srv/woodright/locks/live-cutover.lock`

All live mutations (cutover, digest-only restart, rollback, ACTIVE_RELEASE promotion) must acquire this exclusive `flock` with bounded timeout and owner metadata (operator, transaction ID, expected/target release).

**Dokploy limitation:** if Dokploy cannot hold this flock natively, operators must use a pre-deploy wrapper that acquires the lock, or run Dokploy as the sole owner and disable parallel `manual_flock_deploy`. Do not claim full coverage when Dokploy can bypass the lock.

## Compare-and-swap

Before mutation, verify:

- `expected_current_release_sha`
- `expected_backend_digest`
- `expected_storefront_digest`

against ACTIVE_RELEASE, ACTIVE_OWNER, live container Config.Image / RepoDigests, and public marker when available.

Mismatch → `conflict` / `aborted_conflict`. No container or metadata write.

## Transaction

Schema: `schemas/woodright-cutover-transaction.schema.json`  
ID: `ctx-<YYYYMMDDTHHMMSSZ>-<slug>`  
States: planned → locked → … → active | rolled_back | failed | aborted_conflict  

ACTIVE_RELEASE is written only after health + public buyer-visible gate.

## Reconciliation

When containers changed outside the current task: read-only gather provenance, then optional metadata write marked `reconciled_external_cutover`. Never report as this agent's deploy.

## Audit log

`/srv/woodright/audit/cutovers.jsonl` — append-only JSONL with hash chain. Transaction directories under `/srv/woodright/cutovers/<id>/` remain canonical evidence.

## Drift monitor

`node scripts/release/monitor-live-drift.cjs --check snapshot.json` — read-only; exit 0 = consistent, 2 = drift.

## Validators (CI gates S–AC)

See `scripts/release/fixtures/{lock,cas,tx,active-public,reconciliation,audit,drift,candidate-cleanup,dq,aborted-dir,reports}/`.
