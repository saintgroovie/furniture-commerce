# Runtime identity governance (Media Gate V2 notes)

Companion to `docs/operator/runtime-identity.md` and `docs/operator/backend-media-promotion-gate.md`.

## Stable vs transition identity

During backend digest advance:

| Phase | ACTIVE_OWNER / EXPECTED_RELEASE | Running BE digest | Gate |
|-------|----------------------------------|-------------------|------|
| STABLE_OLD | old SHA/digests | old | Mode B vs expected |
| TARGET_PRECHECKED | **still old** | old | Mode A vs **target** |
| PROMOTION_IN_PROGRESS | still old | transitioning | lock held |
| TARGET_RUNNING_UNVERIFIED | still old | **new** | Mode B pin target |
| TARGET_VERIFIED | still old | new | evidence written |
| MANIFESTS_RECONCILED | **new** | new | assert + reconcile |
| STABLE_NEW | new | new | monitoring |

Until `TARGET_VERIFIED`, manifests must **not** list the new digest as expected. Monitoring continues to treat expected as old until reconcile; Mode B uses `WOODRIGHT_PINNED_BACKEND_DIGEST` / candidate `--expected-src` so post-promote and reconcile do not chicken-egg.

## PENDING_RELEASE.json

**Not used** in Media Gate V2. Target digest/SHA travel via:

- recreate wrapper env (`IMAGE`, `EXPECTED_DIGEST`, `TARGET_SHA`)
- discovery pin env (`WOODRIGHT_PINNED_BACKEND_DIGEST`, `WOODRIGHT_PINNED_GIT_SHA`)
- optional Mode B evidence JSON (freshness + container id + digest)

## Forbidden

- Updating manifests before Mode B PASS
- Treating keeper/candidate names as live
- Declaring target “active” solely because Mode A passed
- Bypassing `/srv/woodright/locks/live-cutover.lock` for recreate/reconcile
