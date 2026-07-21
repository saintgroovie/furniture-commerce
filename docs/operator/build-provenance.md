# Build provenance (Woodright)

## Build ≠ release

A successful GHCR push is a **build artifact**, not a release. Deploy identity is always:

`image@sha256:<digest>`

from an approved **release manifest**, never a mutable tag.

## Unique build execution identity

Format:

`build-<full-sha>-run-<run-id>-attempt-<attempt>`

- Different run IDs → different tags
- Different attempts → different tags
- Same run → backend and storefront share the same unique tag string
- Digest remains the only immutable artifact identity

## Why SHA-like tags are mutable

`.github/workflows/build-staging-images.yml` historically pushed `:${FULL_SHA}` and `:sha-${FULL_SHA}`. Re-running the workflow for the same commit **moves** those names to new digests (build secrets / cache / Dockerfile changes). Observed: authorized digests for `5683afa` from run `29830575969` were overwritten on tags by rebuild `29831078910`. Run `29838506221` (`dd3fe64`) did not rewrite `:5683afa` tags; it published its own SHA tags.

## Current workflow policy

- Publishes unique `build-…` tags
- Optional convenience alias `mutable-sha-<FULL_SHA>` (explicitly mutable)
- Does **not** publish bare `:<FULL_SHA>` tags
- Writes `build-manifest.json` with `release_authorized: false`
- Declares `woodright.tag.namespace=build-staging-images`
- Does not deploy / does not mutate ACTIVE_OWNER

## Manifests

| Manifest | Purpose |
|---|---|
| Build manifest | Provenance of one workflow execution |
| Release manifest | Authorized digests for cutover |
| ACTIVE_RELEASE.json | Server pointer to live authorized release |

See also: `docs/operator/deployment-by-digest.md`, `docs/operator/release-governance.md`.
