# Deployment by immutable digest

## Why tags are not enough

On 2026-07-21, authorized images for Git SHA `5683afa…` were:

- backend `@sha256:578bd815…cabcf`
- storefront `@sha256:0f422482…db7cc`

Later, mutable tags `:5683afa…` were overwritten by another `Build staging images` run and pointed at **different** index digests. Containers that already ran the authorized digests stayed correct; a tag-based pull/restart would have drifted.

## Required pin form

```text
ghcr.io/saintgroovie/woodright-backend@sha256:<64 hex>
ghcr.io/saintgroovie/woodright-storefront@sha256:<64 hex>
```

## Pre-cutover checklist

1. Owner files agree; no competing controller.
2. Rollback keepers + `COMMANDS.md` exist.
3. `validate-deploy-inputs.cjs` PASS (exact digests, SHA parity, no tag drift flag).
4. Disk space OK; flock acquired.
5. Backend swap → health + marker → storefront swap → health.
6. Public verifier PASS; five samples stable.
7. Update owner files + release manifest fields.

## Deploy input validator

```bash
node scripts/release/validate-deploy-inputs.cjs scripts/release/fixtures/deploy/pos-ok.json
node scripts/release/validate-deploy-inputs.cjs --fixture-dir scripts/release/fixtures/deploy
```

Do **not** run cutover scripts against live from CI.
