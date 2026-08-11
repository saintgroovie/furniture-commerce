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

- Requires an explicit `build_profile` input (`public_demo` | `production_candidate` -
  no default that could silently pick one). Resolved via
  `scripts/release/resolve-image-build-profile.cjs` from
  `ops/config/image-build-profiles/*.conf` - the workflow never reads a
  "site URL" secret for what gets baked; see RCA in that resolver's header
  comment and `ops/config/image-build-profiles/production_candidate.conf`.
- Publishes unique `build-…` tags
  - `build_profile=public_demo` → namespace `build-staging-images`, tag `build-<sha>-run-…`
  - `build_profile=production_candidate` → namespace `build-production-candidate`, tag `build-prod-cand-<sha>-run-…` (never collides with a demo build of the same SHA)
- Optional convenience alias `mutable-sha-<FULL_SHA>` (explicitly mutable)
- Does **not** publish bare `:<FULL_SHA>` tags
- Storefront image build is gated by `scripts/release/scan-storefront-contamination.cjs`
  (scans the actual compiled bytes for the wrong host/launch-contract markers)
  BEFORE the image is pushed
- Writes `build-manifest.json` with `release_authorized: false`, plus
  `build_profile` / `profile_checksum` / `baked_storefront_values` /
  `contamination_scan` / `launch_contract` (non-secret evidence only)
- Declares `woodright.tag.namespace` (see namespace-per-profile above)
- Bakes `com.woodright.deployment-owner=Dokploy` and `woodright.image.build_profile` on backend + storefront OCI config (metadata only; does not replace `ACTIVE_OWNER.json`)
- Does not deploy / does not mutate ACTIVE_OWNER

## Manifests

| Manifest | Purpose |
|---|---|
| Build manifest | Provenance of one workflow execution |
| Release manifest | Authorized digests for cutover |
| ACTIVE_RELEASE.json | Server pointer to live authorized release |

See also: `docs/operator/deployment-by-digest.md`, `docs/operator/release-governance.md`.
